var SS = {
  init: function (context, command, args) {

    var commandOptions = '' + args;

    this.prefs = NSUserDefaults.standardUserDefaults();
    this.context = context;

    this.version = this.context.plugin.version() + "";
    this.SSVersion = this.prefs.stringForKey("SSVersion") + "" || 0;

    this.extend(context);

    this.pluginRoot = this.scriptPath
      .stringByDeletingLastPathComponent()
      .stringByDeletingLastPathComponent()
      .stringByDeletingLastPathComponent();
    this.pluginSketch = this.pluginRoot + "/Contents/Sketch/";
    this.resources = this.pluginRoot + '/Contents/Resources';

    coscript.setShouldKeepAround(false);

    if (command && command == "init") {
      return false;
    }

    this.document = context.document;
    this.documentData = this.document.documentData();
    this.UIMetadata = context.document.mutableUIMetadata();
    this.window = this.document.window();
    this.pages = this.document.pages();
    this.page = this.document.currentPage();
    this.artboard = this.page.currentArtboard();
    this.current = this.artboard || this.page;
    this.configs = this.getConfigs();

    if (command) {
      switch (command) {
        case "sync-panel":
          this.Sync().showPanel(args);
          break;
      }
    }
  },
  extend: function(options, target) {
    var target = target || this;

    for (var key in options) {
      target[key] = options[key];
    }
    return target;
  }
};

SS.extend({
    prefix: "syncToSlides",
    getConfigs: function(container){
        var configsData;
        if(container){
            configsData = this.command.valueForKey_onLayer(this.prefix, container);
        }
        else{
            configsData = this.UIMetadata.objectForKey(this.prefix);
        }

        return JSON.parse(configsData);
    },
    setConfigs: function(newConfigs, container){
        var configsData;
        newConfigs.timestamp = new Date().getTime();
        if(container){
            configsData = this.extend(newConfigs, this.getConfigs(container) || {});
            this.command.setValue_forKey_onLayer(JSON.stringify(configsData), this.prefix, container);
        }
        else{
            configsData = this.extend(newConfigs, this.getConfigs() || {});
            this.UIMetadata.setObject_forKey (JSON.stringify(configsData), this.prefix);
        }
        var saveDoc = this.addShape();
        this.page.addLayers([saveDoc]);
        this.removeLayer(saveDoc);
        return configsData;
    },
    removeConfigs: function(container){
        if(container){
            this.command.setValue_forKey_onLayer(null, this.prefix, container);
        }
        else{
            configsData = this.UIMetadata.setObject_forKey (null, this.prefix);
        }

    }
});

SS.extend({
    openURL: function(url){
        var nsurl = NSURL.URLWithString(url + '?ref=ssp');
        NSWorkspace.sharedWorkspace().openURL(nsurl)
    },
    mathHalf: function(number){
        return Math.round( number / 2 );
    },
    convertUnit: function(length, isText, percentageType){
        if(percentageType && this.artboard){
            var artboardRect = this.getRect( this.artboard );
            if (percentageType == "width") {
                 return Math.round((length / artboardRect.width) * 1000) / 10 + "%";

            }
            else if(percentageType == "height"){
                return Math.round((length / artboardRect.height) * 1000) / 10 + "%";
            }
        }

        var length = Math.round( length / this.configs.scale * 10 ) / 10,
            units = this.configs.unit.split("/"),
            unit = units[0];

        if( units.length > 1 && isText){
            unit = units[1];
        }

        return length + unit;
    },
    toHex:function(c) {
        var hex = Math.round(c).toString(16).toUpperCase();
        return hex.length == 1 ? "0" + hex :hex;
    },
    hexToRgb:function(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: this.toHex(result[1]),
            g: this.toHex(result[2]),
            b: this.toHex(result[3])
        } : null;
    },
    isIntersect: function(targetRect, layerRect){
        return !(
            targetRect.maxX <= layerRect.x ||
            targetRect.x >= layerRect.maxX ||
            targetRect.y >= layerRect.maxY ||
            targetRect.maxY <= layerRect.y
        );
    },
    getDistance: function(targetRect, containerRect){
        var containerRect = containerRect || this.getRect(this.current);

        return {
            top: (targetRect.y - containerRect.y),
            right: (containerRect.maxX - targetRect.maxX),
            bottom: (containerRect.maxY - targetRect.maxY),
            left: (targetRect.x - containerRect.x),
        }
    },
    message: function(message){
        this.document.showMessage(message);
    },
    find: function(format, container, returnArray){
        if(!format || !format.key  || !format.match){
            return false;
        }
        var predicate = NSPredicate.predicateWithFormat(format.key,format.match),
            container = container || this.current,
            items;

        if(container.pages){
            items = container.pages();
        }
        else if( this.is( container, MSSharedStyleContainer ) || this.is( container, MSSharedTextStyleContainer ) ){
            items = container.objectsSortedByName();
        }
        else if( container.children ){
            items = container.children();
        }
        else{
            items = container;
        }

        var queryResult = items.filteredArrayUsingPredicate(predicate);

        if(returnArray) return queryResult;

        if (queryResult.count() == 1){
            return queryResult[0];
        } else if (queryResult.count() > 0){
            return queryResult;
        } else {
            return false;
        }
    },
    clearAllMarks: function(){
        var layers = this.page.children().objectEnumerator();
        while(layer = layers.nextObject()) {
            if(this.is(layer, MSLayerGroup) && this.regexNames.exec(layer.name())){
                this.removeLayer(layer)
            }
        }
    },
    toggleHidden: function(){
        var isHidden = (this.configs.isHidden)? false : !Boolean(this.configs.isHidden);
        this.configs = this.setConfigs({isHidden: isHidden});

        var layers = this.page.children().objectEnumerator();

        while(layer = layers.nextObject()) {
            if(this.is(layer, MSLayerGroup) && this.regexNames.exec(layer.name())){
                layer.setIsVisible(!isHidden);
            }
        }
    },
    toggleLocked: function(){
        var isLocked = (this.configs.isLocked)? false : !Boolean(this.configs.isLocked);
        this.configs = this.setConfigs({isLocked: isLocked});

        var layers = this.page.children().objectEnumerator();

        while(layer = layers.nextObject()) {
            if(this.is(layer, MSLayerGroup) && this.regexNames.exec(layer.name())){
                layer.setIsLocked(isLocked);
            }
        }
    },
});

// export.js
SS.extend({
    exportImage: function (artboard) {

        var exportSize = 3;

        if (this.configs.preferences && this.configs.preferences.exportSize) {
            exportSize = this.configs.preferences.exportSize;
        }

        var options = {
                layer: artboard,
                path: this.toJSString(NSTemporaryDirectory()),
                scale: exportSize,
                name: artboard.objectID(),
                prefix: "",
                suffix: "",
                format: "png"
            },
            document = this.document,
            slice = MSExportRequest.exportRequestsFromExportableLayer(options.layer).firstObject(),
            savePathName = [];

        slice.scale = options.scale;
        slice.format = options.format;

        savePathName.push(
                options.path,
                "/",
                options.prefix,
                options.name,
                options.suffix,
                ".",
                options.format
            );
        savePathName = savePathName.join("");

        document.saveArtboardOrSlice_toFile(slice, savePathName);

        return savePathName;
    },
    allCount: 0,
    getSelectedArtboards: function (selectedIds) {
      var doc = SS.document;
      var currentPage = SS.page;
      var selectedArtboards = [];
      var artboards = currentPage.artboards();

      for (var i = 0; i < selectedIds.length; i++){
          for (var a = 0; a < artboards.length; a++) {
            var artboard = artboards[a],
                objectID = artboard.objectID();
            if(objectID == selectedIds[i]) {
                self.allCount += artboard.children().count();
                selectedArtboards[i] = artboard;
            }
        }
      }

      return selectedArtboards;
    },
    getAllFilesForUpload: function (selectedIds) {
      var doc = SS.document;
      var currentPage = SS.page;
      var outputFilenames = [];
      var artboards = currentPage.artboards();
      var count = artboards.count();

      var selectedArtboards = this.getSelectedArtboards(selectedIds);

        for (var a = 0; a < selectedArtboards.length; a++) {
          var artboardRect = selectedArtboards[a].absoluteRect();
          outputFilenames.push({
            fileId: selectedArtboards[a].objectID(),
            fileURL: this.exportImage(selectedArtboards[a]),
            rect: this.rectToJSON(artboardRect, artboardRect),
            layers: SS.getLayersFromArtboard(selectedArtboards[a]),
            fileIndex: a + 1
          });
        }

      return outputFilenames;
    },
    hasExportSizes: function(layer){
        return layer.exportOptions().exportFormats().count() > 0;
    },
    hasEmoji: function(layer) {
      var fonts = layer.attributedString().fontNames().allObjects();
      return !!/AppleColorEmoji/.exec(fonts);
    },
    isSliceGroup: function(layer) {
        return this.is(layer, MSLayerGroup) && this.hasExportSizes(layer);
    },
    isExportable: function(layer) {
        return this.is(layer, MSTextLayer) ||
               this.is(layer, MSShapeGroup) ||
               this.is(layer, MSBitmapLayer) ||
               this.is(layer, MSSliceLayer) ||
               this.is(layer, MSSymbolInstance) ||
               this.isSliceGroup(layer)
    },
    getStates: function(layer){
        var isVisible = true,
            isLocked = false,
            hasSlice = false,
            isEmpty = false,
            isMaskChildLayer = false,
            isMeasure = false;

        while (!( this.is(layer, MSArtboardGroup) || this.is(layer, MSSymbolMaster) ) ) {
            var group = layer.parentGroup();

            if (!group) { break; }

            if (!layer.isVisible()) {
                isVisible = false;
            }

            if (layer.isLocked()) {
                isLocked = true;
            }

            if ( this.is(group, MSLayerGroup) && this.hasExportSizes(group) ) {
                hasSlice = true
            }

            if (
                this.maskObjectID &&
                group.objectID() == this.maskObjectID &&
                !layer.shouldBreakMaskChain()
            ) {
                isMaskChildLayer = true
            }

            if (
                this.is(layer, MSTextLayer) &&
                layer.isEmpty()
            ) {
                isEmpty = true
            }

            layer = group;
        }
        return {
            isVisible: isVisible,
            isLocked: isLocked,
            hasSlice: hasSlice,
            isMaskChildLayer: isMaskChildLayer,
            isMeasure: isMeasure,
            isEmpty: isEmpty
        }
    },
    getMask: function(group, layer, layerData, layerStates){
        if(layer.hasClippingMask()){
            if(layerStates.isMaskChildLayer){
                this.maskCache.push({
                    objectID: this.maskObjectID,
                    rect: this.maskRect
                });
            }
            this.maskObjectID = group.objectID();
            this.maskRect = layerData.rect;
        }
        else if( !layerStates.isMaskChildLayer && this.maskCache.length > 0 ){
            var mask = this.maskCache.pop();
            this.maskObjectID = mask.objectID;
            this.maskRect = mask.rect;
            layerStates.isMaskChildLayer = true;
        }
        else if ( !layerStates.isMaskChildLayer ) {
            this.maskObjectID = undefined;
            this.maskRect = undefined;
        }

        if (layerStates.isMaskChildLayer){
            var layerRect = layerData.rect,
                maskRect = this.maskRect;

            layerRect.maxX = layerRect.x + layerRect.width;
            layerRect.maxY = layerRect.y + layerRect.height;
            maskRect.maxX = maskRect.x + maskRect.width;
            maskRect.maxY = maskRect.y + maskRect.height;

            var distance = this.getDistance(layerRect, maskRect),
                width = layerRect.width,
                height = layerRect.height;

            if(distance.left < 0) width += distance.left;
            if(distance.right < 0) width += distance.right;
            if(distance.top < 0) height += distance.top;
            if(distance.bottom < 0) height += distance.bottom;

            layerData.rect = {
                    x: ( distance.left < 0 )? maskRect.x: layerRect.x,
                    y: ( distance.top < 0 )? maskRect.y: layerRect.y,
                    width: width,
                    height: height
                }

        }
    },
    getFormats: function( exportFormats ) {
      var formats = [];
      for (var i = 0; i < exportFormats.length; i++) {
        var format = exportFormats[i],
            prefix = "",
            suffix = "";

        if(format.namingScheme){
          if(format.namingScheme()){
            prefix = format.name();
          }
          else{
            suffix = format.name();
          }
        }
        else{
          suffix = format.name();
        }

        formats.push({
          scale: format.scale(),
          prefix: prefix,
          suffix: suffix,
          format: format.fileFormat()
        })
      }
      return formats;
    },
    isIgnored: function (layer) {
        if (layer.name().startsWith('__') || layer.parentGroup().name().startsWith('__')) {
          return true;
        } else {
          return false;
        }
    },
    getExportable: function(layer, savePath){
        var self = this,
            exportable = [],
            size, sizes = layer.exportOptions().exportFormats(),
            fileFormat = this.toJSString(sizes[0].fileFormat()),
            matchFormat = /png|jpg|tiff|webp/.exec(fileFormat);
        var exportFormats =
            (self.configs.unit == "dp/sp" && matchFormat)? [
              { scale: 1 / self.configs.scale, prefix: "drawable-mdpi/", format: "png" },
              { scale: 1.5 / self.configs.scale, prefix: "drawable-hdpi/", format: "png" },
              { scale: 2 / self.configs.scale, prefix: "drawable-xhdpi/", format: "png" },
              { scale: 3 / self.configs.scale, prefix: "drawable-xxhdpi/", format: "png" },
              { scale: 4 / self.configs.scale, prefix: "drawable-xxxhdpi/", format: "png" }
            ]:
            (this.configs.unit == "pt" && matchFormat)? [
              { scale: 1 / self.configs.scale, suffix: "", format: "png" },
              { scale: 2 / self.configs.scale, suffix: "@2x", format: "png" },
              { scale: 3 / self.configs.scale, suffix: "@3x", format: "png" }
            ]:
            self.getFormats(sizes);

        for(exportFormat of exportFormats) {
          var prefix = exportFormat.prefix || "",
              suffix = exportFormat.suffix || "";
          self.exportImage({
                  layer: layer,
                  path: self.assetsPath,
                  scale: exportFormat.scale,
                  name: layer.name(),
                  prefix: prefix,
                  suffix: suffix,
                  format: exportFormat.format
              });

          exportable.push({
                  name: self.toJSString(layer.name()),
                  format: fileFormat,
                  path: prefix + layer.name() + suffix + "." + exportFormat.format
              });
        }

        return exportable;
    },
    getSlice: function(layer, layerData, symbolLayer){
        var objectID = ( layerData.type == "symbol" )? this.toJSString(layer.symbolMaster().objectID()):
                        ( symbolLayer )? this.toJSString(symbolLayer.objectID()):
                        layerData.objectID;
        if(
            (
                layerData.type == "slice" ||
                (
                    layerData.type == "symbol" &&
                    this.hasExportSizes(layer.symbolMaster())
                )
            ) &&
            !this.sliceCache[objectID]
        ){
            var sliceLayer = ( layerData.type == "symbol" )? layer.symbolMaster(): layer;
            if(symbolLayer && this.is(symbolLayer.parentGroup(), MSSymbolMaster)){
                layer.exportOptions().setLayerOptions(2);
            }

            // this.assetsPath = this.savePath + "/assets";
            // NSFileManager
            //     .defaultManager()
            //     .createDirectoryAtPath_withIntermediateDirectories_attributes_error(this.assetsPath, true, nil, nil);

            // this.sliceCache[objectID] = layerData.exportable = this.getExportable(sliceLayer);
            this.slices.push({
                name: layerData.name,
                objectID: objectID,
                rect: layerData.rect
                // exportable: layerData.exportable
            })
        }
        else if( this.sliceCache[objectID] ){
            layerData.exportable = this.sliceCache[objectID];
        }
    },
    getSymbol: function(layer, artboard){
        var self = this,
            layers = [],
            allSymbolLayers = [],
            symbolObjectID = this.toJSString(layer.symbolMaster().objectID());

        if( !self.hasExportSizes(layer.symbolMaster()) && layer.symbolMaster().children().count() > 1 ){
            var  symbolChildren = layer.symbolMaster().children(),
                tempSymbol = layer.duplicate(),
                tempGroup = tempSymbol.detachByReplacingWithGroup();
                tempParentGroup = layer.parentGroup();
                tempGroup.resizeToFitChildrenWithOption(0)

                var tempSymbolLayers = tempGroup.children()
                    overrides = layer.overrides();

                overrides = (overrides) ? overrides.objectForKey(0) : undefined;

                for (var k = 0; k < tempSymbolLayers.count(); k++ ) {
                    var tempSymbolLayer = tempSymbolLayers[k];
                    if( self.is(tempSymbolLayer, MSSymbolInstance) ){
                        var symbolMasterObjectID = self.toJSString(symbolChildren[k].objectID());
                        if(
                          overrides &&
                          overrides[symbolMasterObjectID] &&
                          !!overrides[symbolMasterObjectID].symbolID
                        ){
                          var changeSymbol = self.find({key: "(symbolID != NULL) && (symbolID == %@)", match: self.toJSString(overrides[symbolMasterObjectID].symbolID)}, self.document.documentData().allSymbols());
                          if(changeSymbol){
                            tempSymbolLayer.changeInstanceToSymbol(changeSymbol);
                          }
                          else{
                            tempSymbolLayer = undefined;
                          }
                        }
                    }

                    if (tempSymbolLayer && SS.is(tempSymbolLayer, MSSymbolInstance)) {
                        var symbolLayers = SS.getSymbol(tempSymbolLayer, artboard);
                        for (var j = 0; j < symbolLayers.length; j++) {
                            allSymbolLayers.push(symbolLayers[j]);
                        }
                    } else if(tempSymbolLayer) {
                        allSymbolLayers.push(tempSymbolLayer);
                    }
                }

            this.layersToRemove.push(tempGroup);
        }


        return allSymbolLayers;
    },
    layersToRemove: [],
    getLayersFromArtboard: function (artboard) {
        var allLayers = artboard.children(),
            dataToExport = [];

        if (this.configs.preferences && this.configs.preferences.exportLayers && this.configs.preferences.exportLayers == 2) {
            return {};
        }

        for (var j = 0; j < allLayers.count(); j++) {

            this.maskCache = [];
            this.maskCache = [];
            this.maskObjectID = undefined;
            this.maskRect = undefined;

            var layer = allLayers[j];

            if (!layer) { continue; }

            var artboardRect = artboard.absoluteRect(),
                group = layer.parentGroup(),
                layerStates = this.getStates(layer);

            if (
                this.isIgnored(layer) ||
                !this.isExportable(layer) ||
                !layerStates.isVisible ||
                allLayers[j].class() == 'MSArtboardGroup' ||
                ( layerStates.isLocked && !this.is(layer, MSSliceLayer) ) ||
                layerStates.isEmpty ||
                layerStates.hasSlice ||
                layerStates.isMeasure
            ) {
                continue;
            }

            var layerType = this.is(layer, MSTextLayer) ? "text" :
                            this.is(layer, MSSymbolInstance) ? "symbol" :
                            this.is(layer, MSSliceLayer) || this.hasExportSizes(layer) ? "slice" : "shape";

            if (layerType == 'symbol') {
                var symbolLayersData = this.getSymbolLayersData(layer, artboard);
                this.removeLayersToRemove();
                dataToExport = dataToExport.concat(symbolLayersData);
            } else {
                var layerData = SS.getLayersSpec(layer, artboard);
                dataToExport.push(layerData);
            }
      }

      return dataToExport;
    },
    removeLayersToRemove: function () {
        for (var i = 0; i < this.layersToRemove.length; i++) {
            this.removeLayer(this.layersToRemove[i]);
        }
    },
    getSymbolLayersData: function (symbolLayer, artboard) {

        var symbolLayers = this.getSymbol(symbolLayer, artboard),
            symbolLayersData = [];

        for (var i = 0; i < symbolLayers.length; i++) {
            var layer = symbolLayers[i];

            var layerStates = this.getStates(layer);

            var layerType = this.is(layer, MSTextLayer) ? "text" :
                    this.is(layer, MSSymbolInstance) ? "symbol" :
                    this.is(layer, MSSliceLayer) || this.hasExportSizes(layer) ? "slice" : "shape";

            if (
                !this.isExportable(layer) ||
                !layerStates.isVisible ||
                layer.class() == 'MSArtboardGroup' ||
                ( layerStates.isLocked && !this.is(layer, MSSliceLayer) ) ||
                layerStates.isEmpty ||
                layerStates.hasSlice ||
                layerStates.isMeasure
            ) {
                continue;
            }

            layer.setName("___symbol___" + symbolLayer.objectID() + "_" + i);

            symbolLayersData.push(SS.getLayersSpec(layer, artboard));
        }

        return symbolLayersData;
    },
    getLayersSpec: function (layer, artboard) {
        var artboardRect = artboard.absoluteRect(),
            exportLayerRect = layer.absoluteRect(),
            group = layer.parentGroup(),
            layerStates = this.getStates(layer);

        var objId = this.toJSString( layer.objectID() );

        if(layer.name().startsWith('___symbol___')) {
          objId = this.toJSString( layer.name().replace('___symbol___', '') );
        }

        var layerData = {
          objectID: objId,
          parentID: this.toJSString( artboard.objectID()),
          name: this.toHTMLEncode(this.emojiToEntities(layer.name())),
          parentRect: this.rectToJSON(artboardRect, artboardRect),
          rect: this.rectToJSON(exportLayerRect, artboardRect)
        };

        this.getMask(group, layer, layerData, layerStates);

      return layerData
    },
    getAllArtboardsData: function () {
        var self = this;
        this.artboardsData = [];
        this.selectionArtboards = {};
        var data = {};
        data.selection = [];
        data.current = [];
        data.pages = [];

        // data.exportOption = self.configs.exportOption;
        if(data.exportOption == undefined){
            data.exportOption = true;
        }

        // data.exportInfluenceRect = self.configs.exportInfluenceRect;
        if(data.exportInfluenceRect == undefined){
            data.exportInfluenceRect = false;
        }

        // self.configs.order = (self.configs.order)? self.configs.order: "positive";
        // data.order = self.configs.order;

        data.order = "positive";

        if(this.selection.count() > 0){
            var selectionArtboards = this.find({key: "(class != NULL) && (class == %@)", match: MSArtboardGroup}, this.selection, true);
            if(selectionArtboards.count() > 0){
                selectionArtboards = selectionArtboards.objectEnumerator();
                while(artboard = selectionArtboards.nextObject()){
                    data.selection.push(this.toJSString(artboard.objectID()));
                }
            }
        }
        if(this.artboard) data.current.push(this.toJSString(this.artboard.objectID()));

        // var pages = this.document.pages().objectEnumerator();
        // var pages = this.
        // while(page = pages.nextObject()){
            var page = this.page;
            var pageData = {},
                artboards = page.artboards().objectEnumerator();
            pageData.name = this.toJSString(page.name());
            pageData.objectID = this.toJSString(page.objectID());
            pageData.artboards = [];

            while(artboard = artboards.nextObject()){
                // if(!this.is(artboard, MSSymbolMaster)){
                    var artboardData = {};
                    artboardData.name = this.toJSString(artboard.name());
                    artboardData.objectID = this.toJSString(artboard.objectID());
                    artboardData.MSArtboardGroup = artboard;
                    pageData.artboards.push(artboardData);
                // }
            }
            pageData.artboards.reverse()
            data.pages.push(pageData);
        // }

            return data;
    },

    exportPanel: function(isAuthorized) {

        var data = SS.getAllArtboardsData();
        self.allData = data;

        var url = isAuthorized ? "index.html" : "login.html";

        return this.SSPanel({
            url: this.pluginSketch + "/panel/" + url,
            width: 640,
            height: 500,
            data: data,
            identifier: 'com.google.sketch.slides',
            floatWindow: true,
            callback: {},
        });
    }
});




SS.extend({
  initFramework: function (context, frameworkName) {
    var scriptPath = context.scriptPath;
    var pluginRoot = [scriptPath stringByDeletingLastPathComponent];

    // pluginRoot = "/Users/gsid/Library/Developer/Xcode/DerivedData/SyncToSlides-atkpidlwzafjlvhhxhpshvcdnlnx/Build/Products/Debug/";

    var mocha = [Mocha sharedRuntime];
    if (NSClassFromString(frameworkName) == null) {
      if (![mocha loadFrameworkWithName:frameworkName inDirectory:pluginRoot]) {
        log('An error ocurred while loading the SketchSlides Framework.');
        return;
      }
    }
    return [[ServiceManager alloc] init];
  }
});

SS.extend({
    regexNames: /OVERLAY\#|WIDTH\#|HEIGHT\#|TOP\#|RIGHT\#|BOTTOM\#|LEFT\#|VERTICAL\#|HORIZONTAL\#|NOTE\#|PROPERTY\#|LITE\#/,
    is: function(layer, theClass){
        if(!layer) return false;
        var klass = layer.class();
        return klass === theClass;
    },
    addGroup: function(){
        return MSLayerGroup.new();
    },
    addShape: function(){
        var shape = MSRectangleShape.alloc().initWithFrame(NSMakeRect(0, 0, 100, 100));
        return MSShapeGroup.shapeWithPath(shape);
    },
    addText: function(container){
        var text = MSTextLayer.new();
        text.setStringValue("text");
        return text;
    },
    removeLayer: function(layer){
        var container = layer.parentGroup();
        if (container) container.removeLayer(layer);
    },
    getRect: function(layer){
     var rect = layer.absoluteRect();
        return {
            x: Math.round(rect.x()),
            y: Math.round(rect.y()),
            width: Math.round(rect.width()),
            height: Math.round(rect.height()),
            maxX: Math.round(rect.x() + rect.width()),
            maxY: Math.round(rect.y() + rect.height()),
            setX: function(x){ rect.setX(x); this.x = x; this.maxX = this.x + this.width; },
            setY: function(y){ rect.setY(y); this.y = y; this.maxY = this.y + this.height; },
            setWidth: function(width){ rect.setWidth(width); this.width = width; this.maxX = this.x + this.width; },
            setHeight: function(height){ rect.setHeight(height); this.height = height; this.maxY = this.y + this.height; }
        };
    },
    toNopPath: function(str){
        return this.toJSString(str).replace(/[\/\\\?]/g, " ");
    },
    toHTMLEncode: function(str){
        return this.toJSString(str)
                    .replace(/\</g, "&lt;")
                    .replace(/\>/g, '&gt;')
                    .replace(/\'/g, "&#39;")
                    .replace(/\"/g, "&quot;")
                    .replace(/\u2028/g,"\\u2028")
                    .replace(/\u2029/g,"\\u2029")
                    .replace(/\ud83c|\ud83d/g,"")
                ;
        // return str.replace(/\&/g, "&amp;").replace(/\"/g, "&quot;").replace(/\'/g, "&#39;").replace(/\</g, "&lt;").replace(/\>/g, '&gt;');
    },
    emojiToEntities: function(str) {
      var self = this,
          emojiRegExp = new RegExp("(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|[\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|[\ud83c[\ude32-\ude3a]|[\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])", "g");
        return str.replace(
              emojiRegExp,
              function(match) {
                  var u = "";
                  for (var i = 0; i < match.length; i++) {
                      if( !(i%2) ){
                        u += "&#" + match.codePointAt(i)
                      }
                  }

                  return u;
              });
    },
    toSlug: function(str){
        return this.toJSString(str)
                .toLowerCase()
                .replace(/(<([^>]+)>)/ig, "")
                .replace(/[\/\+\|]/g, " ")
                .replace(new RegExp("[\\!@#$%^&\\*\\(\\)\\?=\\{\\}\\[\\]\\\\\\\,\\.\\:\\;\\']", "gi"),'')
                .replace(/\s+/g,'-')
                ;
    },
    toJSString: function(str){
        return new String(str).toString();
    },
    toJSNumber: function(str){
        return Number( this.toJSString(str) );
    },
    pointToJSON: function(point){
        return {
            x: parseFloat(point.x),
            y: parseFloat(point.y)
        };
    },
    rectToJSON: function(rect, referenceRect) {
        if (referenceRect) {
            return {
                x: Math.round( ( rect.x() - referenceRect.x() ) * 10 ) / 10,
                y: Math.round( ( rect.y() - referenceRect.y() ) * 10 ) / 10,
                width: Math.round( rect.width() * 10 ) / 10,
                height: Math.round( rect.height() * 10 ) / 10
            };
        }

        return {
            x: Math.round( rect.x() * 10 ) / 10,
            y: Math.round( rect.y() * 10 ) / 10,
            width: Math.round( rect.width() * 10 ) / 10,
            height: Math.round( rect.height() * 10 ) / 10
        };
    },
    colorToJSON: function(color) {
        return {
            r: Math.round(color.red() * 255),
            g: Math.round(color.green() * 255),
            b: Math.round(color.blue() * 255),
            a: color.alpha(),
            "color-hex": color.immutableModelObject().stringValueWithAlpha(false) + " " + Math.round(color.alpha() * 100) + "%",
            "argb-hex": "#" + this.toHex(color.alpha() * 255) + color.immutableModelObject().stringValueWithAlpha(false).replace("#", ""),
            "css-rgba": "rgba(" + [
                            Math.round(color.red() * 255),
                            Math.round(color.green() * 255),
                            Math.round(color.blue() * 255),
                            (Math.round(color.alpha() * 100) / 100)
                        ].join(",") + ")",
            "ui-color": "(" + [
                            "r:" + (Math.round(color.red() * 100) / 100).toFixed(2),
                            "g:" + (Math.round(color.green() * 100) / 100).toFixed(2),
                            "b:" + (Math.round(color.blue() * 100) / 100).toFixed(2),
                            "a:" + (Math.round(color.alpha() * 100) / 100).toFixed(2)
                        ].join(" ") + ")"
        };
    },
    colorStopToJSON: function(colorStop) {
        return {
            color: this.colorToJSON(colorStop.color()),
            position: colorStop.position()
        };
    },
    gradientToJSON: function(gradient) {
        var stopsData = [],
            stop, stopIter = gradient.stops().objectEnumerator();
        while (stop = stopIter.nextObject()) {
            stopsData.push(this.colorStopToJSON(stop));
        }

        return {
            type: GradientTypes[gradient.gradientType()],
            from: this.pointToJSON(gradient.from()),
            to: this.pointToJSON(gradient.to()),
            colorStops: stopsData
        };
    },
    shadowToJSON: function(shadow) {
        return {
            type: shadow instanceof MSStyleShadow ? "outer" : "inner",
            offsetX: shadow.offsetX(),
            offsetY: shadow.offsetY(),
            blurRadius: shadow.blurRadius(),
            spread: shadow.spread(),
            color: this.colorToJSON(shadow.color())
        };
    },
    getRadius: function(layer){
        return ( layer.layers && this.is(layer.layers().firstObject(), MSRectangleShape) ) ? layer.layers().firstObject().fixedRadius(): 0;
    },
    getBorders: function(style) {
        var bordersData = [],
            border, borderIter = style.borders().objectEnumerator();
        while (border = borderIter.nextObject()) {
            if (border.isEnabled()) {
                var fillType = FillTypes[border.fillType()],
                    borderData = {
                        fillType: fillType,
                        position: BorderPositions[border.position()],
                        thickness: border.thickness()
                    };

                switch (fillType) {
                    case "color":
                        borderData.color = this.colorToJSON(border.color());
                        break;

                    case "gradient":
                        borderData.gradient = this.gradientToJSON(border.gradient());
                        break;

                    default:
                        continue;
                }

                bordersData.push(borderData);
            }
        }

        return bordersData;
    },
    getFills: function(style) {
        var fillsData = [],
            fill, fillIter = style.fills().objectEnumerator();
        while (fill = fillIter.nextObject()) {
            if (fill.isEnabled()) {
                var fillType = FillTypes[fill.fillType()],
                    fillData = {
                        fillType: fillType
                    };

                switch (fillType) {
                    case "color":
                        fillData.color = this.colorToJSON(fill.color());
                        break;

                    case "gradient":
                        fillData.gradient = this.gradientToJSON(fill.gradient());
                        break;

                    default:
                        continue;
                }

                fillsData.push(fillData);
            }
        }

        return fillsData;
    },
    getShadows: function(style) {
        var shadowsData = [],
            shadow, shadowIter = style.shadows().objectEnumerator();
        while (shadow = shadowIter.nextObject()) {
            if (shadow.isEnabled()) {
                shadowsData.push(this.shadowToJSON(shadow));
            }
        }

        shadowIter = style.innerShadows().objectEnumerator();
        while (shadow = shadowIter.nextObject()) {
            if (shadow.isEnabled()) {
                shadowsData.push(this.shadowToJSON(shadow));
            }
        }

        return shadowsData;
    },
    getOpacity: function(style){
        return style.contextSettings().opacity()
    },
    getStyleName: function(layer){
        var styles = (this.is(layer, MSTextLayer))? this.document.documentData().layerTextStyles(): this.document.documentData().layerStyles(),
            layerStyle = layer.style(),
            sharedObjectID = layerStyle.sharedObjectID(),
            style;

        styles = styles.objectsSortedByName();

        if(styles.count() > 0){
            style = this.find({key: "(objectID != NULL) && (objectID == %@)", match: sharedObjectID}, styles);
        }

        if(!style) return "";
        return this.toJSString(style.name());
    },
    updateContext: function(){
        this.context.document = NSDocumentController.sharedDocumentController().currentDocument();
        this.context.selection = this.SketchVersion >= "42"? this.context.document.selectedLayers().layers(): this.context.document.selectedLayers();

        return this.context;
    }
});

// Panel.js
SS.extend({
  createCocoaObject: function (methods, superclass) {
    var uniqueClassName =   "SS.sketch_" + NSUUID.UUID().UUIDString();
    var classDesc = MOClassDescription.allocateDescriptionForClassWithName_superclass_(uniqueClassName, superclass || NSObject);
    classDesc.registerClass();
    for (var selectorString in methods) {
      var selector = NSSelectorFromString(selectorString);
      [classDesc addInstanceMethodWithSelector:selector function:(methods[selectorString])];
    }
    return NSClassFromString(uniqueClassName).new();
  },

  addFirstMouseAcceptor: function (webView, contentView) {
    var button = this.createCocoaObject({
      'mouseDown:': function (evt) {
        // Remove this view. Subsequent events such the mouseUp event that will
        // probably immediately follow mouseDown or any other mouse events will
        // be handled as if this view is not here because it will not be here!
        this.removeFromSuperview();

        // Now send the same mouseDown event again as if the user had just
        // clicked. With the button gone, this will be handled by the WebView.
        NSApplication.sharedApplication().sendEvent(evt);
      },
    }, NSButton);

    button.setIdentifier('firstMouseAcceptor');
    button.setTransparent(true);
    button.setTranslatesAutoresizingMaskIntoConstraints(false);

    contentView.addSubview(button);

    var views = {
      button: button,
      webView: webView
    };

    // Match width of WebView.
    contentView.addConstraints([NSLayoutConstraint
            constraintsWithVisualFormat:'H:[button(==webView)]'
            options:NSLayoutFormatDirectionLeadingToTrailing
            metrics:null
            views:views]);

    // Match height of WebView.
    contentView.addConstraints([NSLayoutConstraint
            constraintsWithVisualFormat:'V:[button(==webView)]'
            options:NSLayoutFormatDirectionLeadingToTrailing
            metrics:null
            views:views]);

    // Match top of WebView.
    contentView.addConstraints([[NSLayoutConstraint
            constraintWithItem:button attribute:NSLayoutAttributeTop
            relatedBy:NSLayoutRelationEqual toItem:webView
            attribute:NSLayoutAttributeTop multiplier:1 constant:0]]);
  },

  SSPanel: function (options) {
    var self = this,
      threadDictionary,
      options = this.extend(options, {
        url: this.pluginSketch + "/panel/index.html",
        width: 240,
        height: 316,
        floatWindow: false,
        hiddenClose: false,
        data: {},
        callback: function (data) { return data; }
      }),
      result = false;
    options.url = encodeURI("file://" + options.url);

    var frame = NSMakeRect(0, 0, options.width, (options.height + 32)),
      titleBgColor = NSColor.colorWithRed_green_blue_alpha(244 / 255, 180 / 255, 0 / 255, 1),
      contentBgColor = NSColor.colorWithRed_green_blue_alpha(1, 1, 1, 1);

    if (options.identifier) {
      threadDictionary = NSThread.mainThread().threadDictionary();
    }

    if (options.identifier && threadDictionary[options.identifier]) {
      return false;
    }

    var Panel = NSPanel.alloc().init();

    // var Panel = NSPanel.alloc().initWithContentRect_styleMask_backing_defer(frame, 31, 2, 'YES');
    Panel.setTitleVisibility(NSWindowTitleHidden);
    Panel.setTitlebarAppearsTransparent(true);
    Panel.standardWindowButton(NSWindowCloseButton).setHidden(options.hiddenClose);
    Panel.standardWindowButton(NSWindowMiniaturizeButton).setHidden(true);
    Panel.standardWindowButton(NSWindowZoomButton).setHidden(true);
    Panel.setFrame_display(frame, true);
    Panel.setBackgroundColor(contentBgColor);
    Panel.setWorksWhenModal(true);

    if (options.floatWindow) {
      Panel.becomeKeyWindow();
      Panel.setLevel(NSFloatingWindowLevel);
      threadDictionary[options.identifier] = Panel;
      // Long-running script
      COScript.currentCOScript().setShouldKeepAround_(true);
    }

    var contentView = Panel.contentView(),
      webView = WebView.alloc().initWithFrame(NSMakeRect(0, 0, options.width, options.height));

    var windowObject = webView.windowScriptObject();

    contentView.setWantsLayer(true);
    contentView.layer().setFrame(contentView.frame());
    // contentView.layer().setCornerRadius(6);
    // contentView.layer().setMasksToBounds(true);

    webView.setBackgroundColor(contentBgColor);
    webView.setMainFrameURL_(options.url);
    contentView.addSubview(webView);

    var delegate = new MochaJSDelegate({
      "webView:didFinishLoadForFrame:": (function (webView, webFrame) {
        DOMReady = [
            "$(",
                "function(){",
                    "init(" + JSON.stringify(options.data) + ")",
                "}",
            ");"
        ].join("");

        try  {
          if (self.configs.presentation) {
            windowObject.evaluateWebScript("currentPresentation = {};");
            windowObject.evaluateWebScript("currentPresentation.name = " + JSON.stringify(self.configs.presentation.name) + ";");
            windowObject.evaluateWebScript("currentPresentation.id =" + JSON.stringify(self.configs.presentation.id) + ";");
            windowObject.evaluateWebScript("window.lastUpdated =" + JSON.stringify(self.configs.lastUpdated) + ";");
          }

          windowObject.evaluateWebScript("window.preferences =" + JSON.stringify(self.configs.preferences) + ";");
          windowObject.evaluateWebScript("window.version =" + JSON.stringify(self.version) + ";");
        } catch(e) {
          log(e);
        }

        windowObject.evaluateWebScript('_onLoad();');
        windowObject.evaluateWebScript(DOMReady);
      }),
      "webView:didChangeLocationWithinPageForFrame:": (function (webView, webFrame) {
        var request = NSURL.URLWithString(webView.mainFrameURL()).fragment();

        if (request == "submit") {
          var data = JSON.parse(decodeURI(windowObject.valueForKey("SSData")));
          options.callback(data);
          result = true;
          if (!options.floatWindow) {
            windowObject.evaluateWebScript("window.location.hash = 'close';");
          }
        }

        if (request == 'fetchUser') {
          SS.frameWork.userInfo(webView);
        }

        if (request == 'lastUpdated') {
          var lastUpdated = JSON.parse(decodeURI(windowObject.valueForKey("lastUpdated")));
          self.configs = self.setConfigs({ lastUpdated: lastUpdated });
        }

        if (request == 'refreshArtboards') {
          newData = SS.getAllArtboardsData();
          self.allData = newData;
          var d = JSON.stringify(newData);
          windowObject.evaluateWebScript("init(" + d + ")");
        }

        if (request == 'fetchPresentation') {
          var data = JSON.parse(decodeURI(windowObject.valueForKey("SSData")));
          SS.frameWork.fetchPresentation_webView_shouldUpload(data.presentationId, webView, false);
        }

        if (request == 'signIn') {
          SS.frameWork.signIn(webView);
        }

        if (request == 'signOut') {
          SS.frameWork.signOut(webView);
        }

        if (request == 'LogOutSuccess') {
          windowObject.evaluateWebScript("window.location.href = 'login.html';");
        }

        if (request == 'openLink') {
          var data = JSON.parse(decodeURI(windowObject.valueForKey("Link")));
          SS.openURL(data);
        }

        if (request == 'LogInSuccess') {
          SS['frameWork'] = SS.initFramework(SS.context, 'SyncToSlides');
          windowObject.evaluateWebScript("window.location.href = 'index.html';");
        }

        if (request == 'presFetchSuccess') {
          var data = JSON.parse(decodeURI(windowObject.valueForKey("SSData")));
          self.configs = self.setConfigs({ presentation: data });
          windowObject.evaluateWebScript("_presFetchSuccess()");
        }

        if (request == 'presFetchError') {
          windowObject.evaluateWebScript("_presFetchError()");
        }

        if (request == 'updatePreferences') {
          var preferences = JSON.parse(decodeURI(windowObject.valueForKey("preferences")));
          self.configs = self.setConfigs({ preferences: preferences });
        }

        if (request == 'startSync') {
          var data = JSON.parse(decodeURI(windowObject.valueForKey("SSData")));
          var files = SS.getAllFilesForUpload(data.selectedArtboards);
          if (files.length > 0 ) {
            SS.frameWork.syncToSlides_allFiles_webView(data.presentationId, files, webView);
          } else {
            windowObject.evaluateWebScript('_artBoardsMissing();');
          }
        }

        if (request == 'onWindowDidBlur') {
          SS.addFirstMouseAcceptor(webView, contentView);
        }

        if (request == "close") {
          if (!options.floatWindow) {
            Panel.orderOut(nil);
            NSApp.stopModal();
          }
          else {
            Panel.close();
          }
        }

        if (request == "focus") {
          var point = Panel.currentEvent().locationInWindow(),
            y = NSHeight(Panel.frame()) - point.y - 32;
          windowObject.evaluateWebScript("lookupItemInput(" + point.x + ", " + y + ")");
        }
        windowObject.evaluateWebScript("window.location.hash = '';");
      })
    });

    webView.setFrameLoadDelegate_(delegate.getClassInstance());
    // NSButton already returns YES for -acceptsFirstMouse: so all we need to do
    // is handle the mouseDown event.
    if (options.floatWindow) {
      Panel.center();
      Panel.makeKeyAndOrderFront(nil);
    }

    var closeButton = Panel.standardWindowButton(NSWindowCloseButton);
    closeButton.setCOSJSTargetFunction(function (sender) {
      var request = NSURL.URLWithString(webView.mainFrameURL()).fragment();

      if (options.floatWindow && request == "submit") {
        data = JSON.parse(decodeURI(windowObject.valueForKey("MDData")));
        options.callback(data);
      }

      if (options.identifier) {
        threadDictionary.removeObjectForKey(options.identifier);
      }

      self.wantsStop = true;
      if (options.floatWindow) {
        Panel.close();
      }
      else {
        Panel.orderOut(nil);
        NSApp.stopModal();
      }

    });
    closeButton.setAction("callAction:");

    var titlebarView = contentView.superview().titlebarViewController().view(),
      titlebarContainerView = titlebarView.superview();
    closeButton.setFrameOrigin(NSMakePoint(8, 8));
    titlebarContainerView.setFrame(NSMakeRect(0, options.height, options.width, 32));
    titlebarView.setFrameSize(NSMakeSize(options.width, 32));
    titlebarView.setTransparent(true);
    titlebarView.setBackgroundColor(titleBgColor);
    titlebarContainerView.superview().setBackgroundColor(titleBgColor);

    if (!options.floatWindow) {
      NSApp.runModalForWindow(Panel);
    }

    return result;
  }

});

SS['Sync'] = function () {

  var _showPanel = function () {
    SS['frameWork'] = SS.initFramework(SS.context, 'SyncToSlides');
    SS.frameWork.setWebView(SS.webView);
    var isAuthorized = SS.frameWork.isAuthorized();
    SS.exportPanel(isAuthorized);
  }

  return {
    showPanel: _showPanel
  }
}

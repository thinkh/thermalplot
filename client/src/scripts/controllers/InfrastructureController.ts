/**
 * Created by Holger Stitz on 10.10.2014.
 */
import * as angular from 'angular';
import * as d3 from 'd3';
import DataService from '../services/DataService';
import Animator from '../services/Animator';
import InfrastructureLoader from '../services/InfrastructureLoader';
import InfrastructureMapper from '../services/InfrastructureMapper';
import LayoutManager from '../services/LayoutManager';
import BookmarkService from '../services/BookmarkService';
import DataSelection from '../services/DataSelection';
import UseCaseConfig from '../services/UseCaseConfig';
import ChangeBorder from '../services/ChangeBorderService';
import TargetHierarchy from '../services/TargetHierarchy';

'use strict';

class InfrastructureController {
  public usecase;

  public socketStream = '';

  public infrastructureFiles = [];
  public defaultInfraId = '';

  public mappingFile;
  public mapDynamicNodeAttributes = [];
  public mapDynamicEdgeAttributes = [];

  public traitsFile;
  public bookmarksFile;

  /**
   * If connection is established try to bulk load the past selection (from DataSelection.past)
   * @type {boolean}
   */
  public onConnInitAutoLoadPast = false;

  public loading = {
    visible: true,
    error: false,
    text: 'Loading infrastructure...'
  };

  private initPromise = null;

  constructor(public $http, public $q, public pvdDataService, public pvdAnimator, public pvdInfrastructureLoader, public pvdInfrastructureMapper, public pvdLayoutManager, public pvdBookmarkService, public pvdDataSelection, public pvdUseCaseConfig) {
  }

  public loadUseCaseConfig(usecase) {
    var that = this;

    this.usecase = usecase;

    if (this.pvdUseCaseConfig.usecases.has(usecase)) {
      var data = this.pvdUseCaseConfig.usecases.get(usecase);

      that.socketStream = data.socketStream || that.socketStream;

      that.infrastructureFiles = data.infrastructureFiles || that.infrastructureFiles;
      that.defaultInfraId = data.defaultInfraId || that.defaultInfraId;

      that.mappingFile = data.mappingFile || that.mappingFile;
      that.mapDynamicNodeAttributes = data.mapDynamicNodeAttributes || that.mapDynamicNodeAttributes;
      that.mapDynamicEdgeAttributes = data.mapDynamicEdgeAttributes || that.mapDynamicEdgeAttributes;

      that.traitsFile = data.traitsFile || that.traitsFile;
      that.bookmarksFile = data.bookmarksFile || that.bookmarksFile;

      that.onConnInitAutoLoadPast = data.onConnInitAutoLoadPast || that.onConnInitAutoLoadPast;

      that.initUseCase();
    } else {
      console.error('cannot load use case config file');
    }
  }

  private initUseCase() {
    var that = this;

    that.pvdAnimator.stop();
    that.pvdLayoutManager.reset();
    that.pvdDataService.reset();
    that.pvdInfrastructureLoader.reset();
    that.pvdInfrastructureMapper.reset();

    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.mappingFile !== undefined && this.mappingFile !== "") {
      that.$http.get(this.mappingFile).then(function (data) {
        return that.pvdInfrastructureMapper.parse(data.data);
      }, function (error) {
        console.error('cannot load mapping file', error);
      }).then(function (mapper) {
        that.mapDynamicNodeAttributes.map((d) => {
          mapper.mapDynamicNodeAttribute(d.sourceId, d.targetId, d.attributes, d.reduce);
        });
        that.mapDynamicEdgeAttributes.map((d) => {
          mapper.mapDynamicEdgeAttribute(d.sourceId, d.targetId, d.attributes, d.reduce);
        });
      });
      //mapping example
      /*.then(function (mapper) {
       //return mapper.mapPath('b:dc03.bigmkt3.com', 's');
       return mapper.mapPath('s:s5.rack2.f1.root', 'b');
       }).then(function (mapping) {
       console.log(mapping);
       });*/
    }

    if (this.bookmarksFile !== undefined && this.bookmarksFile !== "") {
      that.$http.get(this.bookmarksFile).then(function (data) {
        that.pvdBookmarkService.set(data.data);
      }, function (error) {
        that.pvdBookmarkService.clear();
        console.error('cannot load bookmark file', error);
      });
    } else {
      that.pvdBookmarkService.clear();
    }

    if (this.infrastructureFiles.length === 0) {
      console.error('No infrastructure.json defined!');
      return;
    }

    var infras = this.infrastructureFiles.map(function (file) {
      return that.$http.get(file);
    });

    var traits = undefined, firstIsTraits = false;
    if (this.traitsFile !== undefined && this.traitsFile !== "") {
      // add to beginning
      infras.unshift(that.$http.get(this.traitsFile));
      firstIsTraits = true;
    }

    this.initPromise = that.$q.all(infras)
      .then(function (datas) {
        if (firstIsTraits) {
          // remove from beginning
          traits = datas.shift().data;
          firstIsTraits = false;
        }

        datas.map(function (d) {
          // override the external traits.json (`traits`) with the infrastructure.json (`config.traits`) one
          var combinedTraits = d3.map(angular.extend({}, traits, d.data.traits));
          that.pvdInfrastructureLoader.traits = combinedTraits; // cache traits to add nodes dynamically
          var infra = that.pvdInfrastructureLoader.parse(d.data, combinedTraits);
          that.pvdLayoutManager.addInfrastructure(infra);
          return infra;
        });

        that.pvdLayoutManager.initialized();

        if (that.socketStream !== "") {
          // bind default infrastructure to data service and selection
          that.pvdDataService.infrastructure = that.pvdInfrastructureLoader.getUnchecked(that.defaultInfraId);
          that.pvdDataSelection.infrastructure = that.pvdInfrastructureLoader.getUnchecked(that.defaultInfraId);

          // auto connect to data stream on websocket (replace regex: remove possible filneame URL and just use directories)
          that.pvdDataService.uri = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + document.location.host + document.location.pathname.replace(/[^\/]*$/, '') + that.socketStream;
          that.pvdDataService.connect();
        }

        //animator will start when the service get it's start message
        return true;
      });

    this.initPromise.then(function (status) {
      if (!status) {
        that.loading.text = 'Error while loading infrastructure data! See console output for further information.';
        that.loading.error = true;
      } else {
        that.loading.visible = false;
      }
    }, function (data) {
      console.error(data);
      that.loading.text = 'Error while loading infrastructure data! See console output for further information.';
      that.loading.error = true;
    });

  }
}

export default angular.module('controllers.InfrastructureCtrl', [
  DataService,
  Animator,
  InfrastructureLoader,
  InfrastructureMapper,
  LayoutManager,
  BookmarkService,
  DataSelection,
  UseCaseConfig,
  ChangeBorder,
  TargetHierarchy
])
  .controller('InfrastructureCtrl', [
    'useCaseName', 'useCaseConfig', '$scope', '$http', '$q', 'pvdDataService', 'pvdAnimator', 'pvdInfrastructureLoader', 'pvdInfrastructureMapper', 'pvdLayoutManager', 'pvdBookmarkService', 'pvdDataSelection', 'pvdUseCaseConfig', 'pvdChangeBorder', 'pvdTargetHierarchy',
    function (useCaseName, useCaseConfig, $scope, $http, $q, pvdDataService, pvdAnimator, pvdInfrastructureLoader, pvdInfrastructureMapper, pvdLayoutManager, pvdBookmarkService, pvdDataSelection, pvdUseCaseConfig, pvdChangeBorder, pvdTargetHierarchy) {
      var controller = new InfrastructureController($http, $q, pvdDataService, pvdAnimator, pvdInfrastructureLoader, pvdInfrastructureMapper, pvdLayoutManager, pvdBookmarkService, pvdDataSelection, pvdUseCaseConfig);
      $scope.loading = controller.loading;

      if (useCaseConfig.hasOwnProperty('mapHierarchyOrder') && useCaseConfig['mapHierarchyOrder'].length > 0) {
        pvdTargetHierarchy.hierarchy = useCaseConfig['mapHierarchyOrder'];
      }

      if (useCaseConfig.hasOwnProperty('changeBorders')) {
        if (useCaseConfig.changeBorders.hasOwnProperty('vertical')) {
          pvdChangeBorder.initChangeBorder('vertical', useCaseConfig.changeBorders.vertical);
        }
        if (useCaseConfig.changeBorders.hasOwnProperty('horizontal')) {
          pvdChangeBorder.initChangeBorder('horizontal', useCaseConfig.changeBorders.horizontal);
        }
        if (useCaseConfig.changeBorders.hasOwnProperty('segmentRep')) {
          useCaseConfig.changeBorders.segmentRep.forEach((repConfig) => {
            pvdChangeBorder.addSegmentRep(repConfig);
          });
        }
      }

      // for debugging
      /*pvdDataService.on('open', function() {
        console.log('open websocket');
      });
      pvdDataService.on('close', function() {
        console.log('close websocket');
      });
      pvdDataService.on('error', function(error) {
        console.error('websocket error', error);
      });
      pvdDataService.on('message', function(msg) {
        console.log(msg);
      });*/

      controller.loadUseCaseConfig(useCaseName);
    }
  ])
  .name; // name for export default

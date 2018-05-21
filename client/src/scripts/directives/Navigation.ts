/**
 * Created by Samuel Gratzl on 07.10.2014.
 */

import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import * as $ from '@bower_components/jquery';
import { nextID, onDelete } from './VisUtils';
import Animator, { PVDAnimator } from '../services/Animator';
import UseCaseConfig, { PVDUseCaseConfig } from '../services/UseCaseConfig';
import DataSelection, { PVDDataSelection } from '../services/DataSelection';
import LayoutManager, { PVDLayoutManager, PVDHierarchyLayoutConfig } from '../services/LayoutManager';
import DataService, { PVDDataService } from '../services/DataService';
import { Infrastructure } from '../models/Infrastructure';

export default angular.module('directives.pvdNavigation', [
  UseCaseConfig,
  DataSelection,
  LayoutManager,
  DataService,
  Animator
])
  .directive('pvdNavigation', function () {
    return {
      templateUrl: 'views/templates/Navigation.html',
      controller: function ($scope, $rootScope, $element, $http,
        pvdUseCaseConfig: PVDUseCaseConfig,
        pvdDataSelection: PVDDataSelection,
        pvdLayoutManager: PVDLayoutManager,
        pvdDataService: PVDDataService,
        pvdAnimator: PVDAnimator) {
        $rootScope.navigation_dummy.visible = false;

        // activate option by default
        $scope.$root.ActivateThermalLineChart = true;

        $scope.isUndefinedProject = function () {
          return !($scope.isCloudGazer() || $scope.isThermalPlot());
        }

        $scope.isCloudGazer = function () {
          return $scope.project === 'cloudgazer';
        }

        $scope.isThermalPlot = function () {
          return $scope.project === 'thermalplot';
        }

        $scope.useCases = [];
        pvdUseCaseConfig.load($http, function (data) {
          $scope.useCases = data.values();
        }, function () {

        });

        $scope.optionsDialog = {
          isVisible: false
        };

        $scope.aboutDialog = {
          isVisible: false,
          version: { 'bla': 12 }
        };

        $http.get('version').then(function (response) {
          $scope.aboutDialog.version = response.data;
        }, function (data) {
          console.error('Error loading version', data);
        });

        $scope.getVersion = () => {
          var r = '', v = $scope.aboutDialog.version;

          if (v.tornado !== undefined) {
            r += '[tornado]\n';
            for (var prop in v.tornado) {
              if (v.tornado.hasOwnProperty(prop))
                r += prop + ' = ' + v.tornado[prop] + '\n';
            }
          }

          //return JSON.stringify($scope.aboutDialog.version);
          return r;
        };

        $scope.dataSelection = pvdDataSelection;

        $scope.layouts = pvdLayoutManager.layouts;
        $scope.configs = pvdLayoutManager.configs;

        pvdLayoutManager.on('initialized', function () {
          $scope.layouts = pvdLayoutManager.layouts;
          $scope.configs = pvdLayoutManager.configs;
        });

        $scope.updateNodes = (layoutConfig: PVDHierarchyLayoutConfig) => {
          pvdLayoutManager.updateNodes(layoutConfig);
        };

        $scope.updateLayout = (layoutConfig: PVDHierarchyLayoutConfig) => {
          pvdLayoutManager.updateLayout(layoutConfig);
        };

        var selectedConfig: PVDHierarchyLayoutConfig = pvdLayoutManager.getFirstLayoutConfig() || null;
        $scope.selectTab = (layoutConfig: PVDHierarchyLayoutConfig) => {
          setTimeout(function () {
            if ($scope.optionsDialog.isVisible) {
              selectedConfig = layoutConfig;
            }
          });
        };

        $scope.deselectTab = function () {
          setTimeout(function () {
            if ($scope.optionsDialog.isVisible && selectedConfig !== null) {
              pvdDataSelection.infra = selectedConfig.infra;
            }
          });
        };

        var id = ".navigator" + nextID();
        pvdDataSelection.on('infra' + id, (newInfra: Infrastructure) => {
          $scope.configs.forEach((c) => {
            c.active = (newInfra.id === c.infra.id);
            if (c.active) {
              selectedConfig = c;
            }
          });
        }
        );
        onDelete(d3.select($element[0]), () => {
          pvdDataSelection.on('infra' + id, null);
        });

        (<any>$("#options")).draggable({ handle: ".modal-title" });
        (<any>$("#about")).draggable({ handle: ".modal-title" });


        $scope.isStreaming = false;

        $scope.toggleDataStream = () => {
          // use last now point from animator
          // related to HACKS for data streaming in StockTimeline.ts
          // e.g., manipulation of the animator.now for pinned selections
          var sel = pvdDataSelection.getSelection(pvdAnimator.now);

          if ($scope.isStreaming) {
            $scope.isStreaming = false;
            pvdDataSelection.setPinnedSelection(sel.point, sel.past);
            pvdDataService.stopStream(() => {
              console.log('stopped streaming', pvdAnimator.now, sel);
            });

          } else {
            $scope.isStreaming = true;
            pvdDataSelection.setRelativeSelection(0, sel.past);
            // start streaming with last end/now time point
            pvdDataService.startStream(sel.end, function () {
              console.info('start streaming', pvdAnimator.now, sel);
            });

          }
        };
      },
      restrict: 'EA',
      scope: {
        project: '@'
      }
    }
  })
  .name; // name for export default

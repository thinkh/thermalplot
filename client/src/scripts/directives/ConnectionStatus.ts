/**
 * Created by Holger Stitz on 23.04.2014.
 */

import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import { nextID, onDelete } from './VisUtils';
import DataService, { PVDDataService } from '../services/DataService';

'use strict';

/**
 * Directive creates a Bootstrap button with an icon to indicate,
 * if the application is connected to the data service and if the streaming is enabled.
 */
export default angular.module('directives.pvdConnectionStatus', [DataService])
  .directive('pvdConnectionStatus', function (pvdDataService: PVDDataService) {
    return {
      template: `<div class="btn-group">
                <button class="btn btn-default" ng-click="toggleConnection()" title="{{getTitle()}}">
                <i ng-class="{\'connected\': \'fa fa-circle connected\', \'stoppedStream\': \'fa fa-circle-o connected\', \'disconnected\': \'fa fa-circle-o disconnected\'}[indicator]"></i><span class="sr-only">&nbsp;{{getScreenReaderText()}}</span>
                </button></div>`,
      restrict: 'E',
      scope: {},
      link: function postLink($scope, element) {
        var scope = (<any>$scope); // cast to prevent errors from TypeScript compiler since v1.5

        // initialize
        scope.isConnected = pvdDataService.isConnected;
        scope.indicator = (pvdDataService.isConnected) ? 'connected' : 'disconnected'; // by default streaming is started

        // button action and texts
        scope.toggleConnection = () => {
          if (scope.isConnected == true) {
            pvdDataService.disconnect();
          } else {
            pvdDataService.connect();
          }
        };

        scope.getTitle = () => {
          if (scope.isConnected == true) {
            return 'Connected to data stream, click to disconnect';
          } else {
            return 'Disconnected from data stream, click to connect';
          }
        };

        scope.getScreenReaderText = () => {
          if (scope.isConnected == true) {
            return 'Connected';
          } else {
            return 'Disconnected';
          }
        };

        // create unique class id for listener
        var id = '.status' + nextID();

        pvdDataService.on('open' + id, () => {
          scope.isConnected = true;
          scope.indicator = 'connected'; // by default streaming is started
          scope.$apply();
        });

        pvdDataService.on('close' + id, () => {
          scope.isConnected = false;
          scope.indicator = 'disconnected'; // stops also streaming
          scope.$apply();
        });

        pvdDataService.on('startedStream' + id, () => {
          scope.indicator = 'connected';
          scope.$apply();
        });

        pvdDataService.on('stoppedStream' + id, () => {
          scope.indicator = 'stoppedStream'; // connected, but no streaming
          scope.$apply();
        });

        // remove listeners on DOM delete
        onDelete(d3.select(element[0]), () => {
          pvdDataService.on('open' + id, null);
          pvdDataService.on('close' + id, null);
          pvdDataService.on('startedStream' + id, null);
          pvdDataService.on('stoppedStream' + id, null);
        });
      }
    };
  })
  .name; // name for export default

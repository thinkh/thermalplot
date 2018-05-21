/**
 * Created by Holger Stitz on 03.02.2015.
 */
import angular from '@bower_components/angular';
import * as $ from '@bower_components/jquery';
import DataService, { PVDDataService } from '../services/DataService';
import { PVDUseCaseConfig } from '../services/UseCaseConfig';
import { PVDLayoutManager } from '../services/LayoutManager';
import { PVDBroadcastService } from '../services/BroadcastService';


'use strict';

export default angular.module('controllers.UseCaseSelectorCtrl', [DataService])
  .controller('UseCaseSelectorCtrl', [
    '$rootScope', '$scope', '$http', 'pvdDataService',
    function ($rootScope, $scope, $http, dataService: PVDDataService) {
      // stop websocket connection
      dataService.reset();

      $scope.loading = {
        visible: true,
        error: false,
        text: 'Loading use cases...'
      };

      $rootScope.navigation_dummy = {
        visible: false
      };

      $rootScope.title = "[" + $scope.loading.text + "]";

      $http.get('api/all_use_cases').then(function (data) {
        $scope.usecases = data.data;

        $rootScope.title = 'Select a use case';
        $scope.loading.visible = false;
        $scope.loading.text = 'Successfully loaded use cases!';
      }, function (data) {
        console.error('Error loading use cases', data);
        $scope.loading.error = true;
        $scope.loading.text = 'Error loading use cases!';
      });
    }
  ])
  .name;

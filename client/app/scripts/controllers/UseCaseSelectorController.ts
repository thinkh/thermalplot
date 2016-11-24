/**
 * Created by Holger Stitz on 03.02.2015.
 */
/// <reference path="../../../tsd.d.ts" />
'use strict';

module PVDController {

  angular.module('pipesVsDamsApp').controller('UseCaseSelectorCtrl', [
    '$rootScope', '$scope', '$http', 'pvdDataService',
    function ($rootScope, $scope, $http, dataService:PVDDataService) {
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

      $http.get('all_use_cases').then(function (data) {
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
  ]);

  angular.module('pipesVsDamsApp').
    controller('UseCaseRouteCtrl', [
      '$rootScope', '$scope', '$controller', '$http', '$routeParams', 'pvdUseCaseConfig', 'pvdDataService', 'pvdLayoutManager', 'pvdBroadcastService',
      function ($rootScope, $scope, $controller, $http, $routeParams, pvdUseCaseConfig:PVDUseCaseConfig, dataService:PVDDataService, layoutManager:PVDLayoutManager, broadcastService:PVDBroadcastService) {
        var usecase = $routeParams.usecase;

        if (usecase === undefined) {
          console.error('No use case for controller defined!');
          return;
        }

        // stop websocket connection
        dataService.reset();

        $scope.loading = {
          visible: true,
          error: false,
          text: 'Loading use case ...'
        };

        $rootScope.navigation_dummy = {
          visible: true
        };

        $rootScope.title = "[" + $scope.loading.text + "]";
        $scope.controller = function () {
        };
        $scope.templateUrl = '';

        $scope.switchTab = function($event) {
          $event.preventDefault();
          $($event.currentTarget).tab('show');
        };
        $scope.activateTab = function($event) {
          $($event.currentTarget).siblings().removeClass('active');
          $($event.currentTarget).addClass('active');
        };

        // for ThermalPlot template files
        $scope.showTrajectories = false;
        $scope.toggleTrajectories = function($event) {
          var config = layoutManager.getLayoutConfig($event.currentTarget.dataset.infraId);
          config.showTrajectories = !config.showTrajectories;
          $scope.showTrajectories = config.showTrajectories;
          layoutManager.updateLayout(config);
        };

        $http.get('uc/' + usecase + '/').then(function (response) {
          //console.log('Use case config successfully loaded', response);
          var data = response.data;

          // default controller
          if (data.controller === undefined || data.controller === "") {
            data.controller = 'InfrastructureCtrl';
            console.info('Use default controller', data.controller);
          }

          var templateUrl = data.templateUrl;

          // check template url
          if(data.templateUrl !== null && typeof data.templateUrl === 'object') {
            templateUrl = data.templateUrl.default;

            if($routeParams.view !== undefined && data.templateUrl[$routeParams.view] !== undefined) {
              templateUrl = data.templateUrl[$routeParams.view];
              // activate broadcast for multi-window setup
              broadcastService.isActive = true;
            }
          }

          if($routeParams.broadcast !== undefined && $routeParams.broadcast === "true") {
            broadcastService.isActive = true;
          }

          // default template URL
          if (templateUrl === undefined || templateUrl === "") {
            templateUrl = 'views/infrastructure_vast.html';
            console.info('Use default template', data.templateUrl);
          }
          $scope.templateUrl = templateUrl;

          pvdUseCaseConfig.usecases.set(usecase, data);

          $rootScope.title = data.title;
          $scope.controller = [
            'useCaseName', 'useCaseConfig', '$scope', '$http', '$q', 'pvdDataService', 'pvdAnimator', 'pvdInfrastructureLoader', 'pvdInfrastructureMapper', 'pvdLayoutManager', 'pvdBookmarkService', 'pvdDataSelection', 'pvdUseCaseConfig',
            $controller(data.controller, {$scope: $scope, useCaseName: usecase, useCaseConfig: data}).constructor
          ];
          $scope.loading.visible = false;

        }, function (error) {
          console.error('Cannot load use case config file', error);
          $scope.loading.text = 'Cannot load use case config file! See console for more details or <a href="#">continue to overview</a>.';
          $scope.loading.error = true;
        });
      }
    ]);
}

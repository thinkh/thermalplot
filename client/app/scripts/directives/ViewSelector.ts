/**
 * Created by Samuel Gratzl on 14.03.2015.
 */

/// <reference path="../../../tsd.d.ts" />

angular.module('pipesVsDamsApp').directive('pvdViewSelector', function (pvdLayoutManager:PVDLayoutManager) {
    return {
      templateUrl: 'views/templates/ViewSelector.html',
      link: function ($scope:any, $element) {
		$scope.switchTab = function ($event) {
			$event.preventDefault();
			$($event.currentTarget).tab('show');
		};
		$scope.activateTab = function ($event) {
			$($event.currentTarget).siblings().removeClass('active');
			$($event.currentTarget).addClass('active');
		};
		// for ThermalPlot template files
		$scope.showTrajectories = false;
		$scope.toggleTrajectories = function ($event) {
			var config = pvdLayoutManager.getLayoutConfig($event.currentTarget.dataset.infraId);
			config.showTrajectories = !config.showTrajectories;
			$scope.showTrajectories = config.showTrajectories;
			pvdLayoutManager.updateLayout(config);
		};
      },
      restrict: 'EA',
      scope: {}
    }
  }
);

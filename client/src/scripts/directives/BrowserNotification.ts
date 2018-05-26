/**
 * Created by Holger Stitz on 11.08.2015.
 */
import * as angular from 'angular';

'use strict';

export default angular.module('directives.pvdBrowserNotification', [])
  .directive('pvdBrowserNotification', [function () {
    return {
      templateUrl: 'views/templates/BrowserNotification.html',
      link: function ($scope: any) {
        $scope.isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
      },
      scope: {},
      restrict: 'EA'
    };
  }])
  .name; // name for export default

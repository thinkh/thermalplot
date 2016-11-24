/**
 * Created by Holger Stitz on 11.08.2015.
 */
/// <reference path='../../../tsd.d.ts' />
/*global d3 Physics*/
'use strict';

module PVDVisualizations {

  angular.module('pipesVsDamsApp').directive('pvdBrowserNotification', function () {
    return  {
      templateUrl: 'views/templates/BrowserNotification.html',
      controller: function ($scope) {
        // @see: http://stackoverflow.com/questions/4565112/javascript-how-to-find-out-if-the-user-browser-is-chrome
        // please note,
        // that IE11 now returns undefined again for window.chrome
        // and new Opera 30 outputs true for window.chrome
        // so use the below updated condition
        var isChromium = (<any>window).chrome,
            vendorName = window.navigator.vendor,
            isOpera = window.navigator.userAgent.indexOf("OPR") > -1;
        if(isChromium !== null && isChromium !== undefined && vendorName === "Google Inc." && isOpera == false) {
           $scope.chrome = true;
        } else {
           $scope.chrome = false;
        }
      },
      scope: {},
      restrict: 'EA'
    };
  });

}

/**
 * Created by Samuel Gratzl on 14.03.2015.
 */

/// <reference path="../../../tsd.d.ts" />

angular.module('pipesVsDamsApp').directive('pvdColorLegend', function (pvdChangeBorder:PVDChangeBorder) {
    return {
      templateUrl: 'views/templates/Legend.html',
      link: function ($scope, $element) {
        var g = pvdChangeBorder.vertical.getColorLegend();
        $element.find('span').last().text(g.left);
        $element.find('span').first().text(g.right);
        $element.find('div').css('background',g.gradient);
      },
      restrict: 'EA',
      scope: {
        'infraId': '@?' // id of infrastructure*.json
      }
    }
  }
);

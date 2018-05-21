/**
 * Created by Samuel Gratzl on 14.03.2015.
 */

import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import ChangeBorderService, { PVDChangeBorder } from '../services/ChangeBorderService';

export default angular.module('directives.pvdColorLegend', [
  ChangeBorderService
])
  .directive('pvdColorLegend', function (pvdChangeBorder: PVDChangeBorder) {
    return {
      templateUrl: 'views/templates/Legend.html',
      link: function ($scope, $element) {
        var g = pvdChangeBorder.vertical.getColorLegend();
        $element.find('span').last().text(g.left);
        $element.find('span').first().text(g.right);
        $element.find('div').css('background', g.gradient);
      },
      restrict: 'EA',
      scope: {
        'infraId': '@?' // id of infrastructure*.json
      }
    }
  })
  .name; // name for export default

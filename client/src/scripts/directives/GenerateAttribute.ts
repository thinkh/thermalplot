/**
 * Created by Samuel Gratzl on 20.04.2014.
 */
import * as angular from 'angular';
import * as d3 from 'd3';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import { NumberAttribute } from '../models/Models';
import { Infrastructure } from '../models/Infrastructure';
import DataGenerator, { PVDDataGenerator } from '../services/DataGenerator';

/**
 * directive which adds the given attribute to the PVDDataGenerator
 */
export default angular.module('directives.pvdGenerateAttribute', [
  DataGenerator,
  InfrastructureLoader
])
  .directive('pvdGenerateAttribute', [
    'pvdDataGenerator',
    'pvdInfrastructureLoader',
    function (
      pvdDataGenerator: PVDDataGenerator,
      pvdInfrastructureLoader: PVDInfrastructureLoader
    ) {
      return {
        controller: function ($scope) {
        },
        link: function ($scope, element) {
          pvdInfrastructureLoader.get().then((infrastructure: Infrastructure) => {
            var path: string = (<any>$scope).path;
            var attr = infrastructure.findAttr(path);
            var $base = d3.select(element[0]);
            if (!attr) {
              $base.text("Invalid attribute path: " + path);
            } else if (attr.valueType !== Number) {
              $base.text("Invalid attribute type: " + path + " expected number got " + attr.valueType);
            } else {
              pvdDataGenerator.attrs.push(<NumberAttribute>attr);
            }
          })
        },
        scope: {
          'path': '@'
        },
        restrict: 'E'
      }
    }])
  .name; // name for export default

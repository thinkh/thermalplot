/**
 * Created by Samuel Gratzl on 20.04.2014.
 */
/// <reference path="../../../tsd.d.ts" />

/**
 * directive which adds the given attribute to the PVDDataGenerator
 */
angular.module('pipesVsDamsApp').directive('pvdGenerateAttribute', function (pvdDataGenerator:PVDDataGenerator, pvdInfrastructureLoader : PVDInfrastructureLoader) {
    return  {
      controller: function ($scope) {
      },
      link: function ($scope, element) {
        pvdInfrastructureLoader.get().then((infrastructure: PVDModels.Infrastructure) => {
          var path:string = (<any>$scope).path;
          var attr = infrastructure.findAttr(path);
          var $base = d3.select(element[0]);
          if (!attr) {
            $base.text("Invalid attribute path: " + path);
          } else if (attr.valueType !== Number) {
            $base.text("Invalid attribute type: " + path+ " expected number got "+attr.valueType);
          } else {
            pvdDataGenerator.attrs.push(<PVDModels.NumberAttribute>attr);
          }
        })
      },
      scope: {
        'path': '@'
      },
      restrict: 'E'
    }
  }
)

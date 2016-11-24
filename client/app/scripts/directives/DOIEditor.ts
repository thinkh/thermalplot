/**
 * Created by Samuel Gratzl on 18.03.2015.
 */

/// <reference path="../../../tsd.d.ts" />

module PVDVisualizations {

angular.module('pipesVsDamsApp').directive('pvdDoiEditor', function (pvdInfrastructureLoader:PVDInfrastructureLoader, pvdDataSelection:PVDDataSelection, $filter, pvdWindowResize:PVDWindowResize) {
  return {
    templateUrl: 'views/templates/DOIEditor.html',
    link:  function ($scope:any, element) {
      pvdInfrastructureLoader.get($scope.infraId).then((infrastructure:PVDModels.Infrastructure) => {
        var config = infrastructure.visConfig.doi;

        var attrs = d3.map();

        // initialize again and add the new node to DOM
        infrastructure.on('addNode.editor.'+nextID(), (newNode) => {
          newNode.attrs().forEach((attr) => {
            if (!attrs.has(attr.name) && (config.availableAttrs === undefined || config.availableAttrs.indexOf(attr.name) > -1)) {
              attrs.set(attr.name, attr);
            }
          });
          $scope.attrs = [defaultAttrLabel].concat(attrs.keys());
          $scope.components.forEach((c: any) => {
            c.alias = $scope.getAttrAlias(c.name);
          });
          $scope.setDirty(false);
          updateFormula();
        });

        infrastructure.forEachAttr((attr) => {
          if (!attrs.has(attr.name) && (config.availableAttrs === undefined || config.availableAttrs.indexOf(attr.name) > -1)) {
            attrs.set(attr.name, attr);
          }
        });

        var defaultAttrLabel = '+ add attribute ...';
        $scope.attrs = [defaultAttrLabel].concat(attrs.keys());

        $scope.getAttrAlias = function(name) {
          return attrs.has(name) ? attrs.get(name).alias || name : name;
        };

        $scope.components = config.components.map((s) => new PVDDOI.DOIComponent(s.attr, s.weight, s.range || [0,1], s.invert || false));
        $scope.components.forEach((c: any) => {
          c.alias = $scope.getAttrAlias(c.name);
        });

        $scope.toadd = defaultAttrLabel;
        $scope.$watch('toadd', function(newValue, oldValue) {
          if (newValue !== '' && newValue && newValue !== defaultAttrLabel) {
            var last = new PVDDOI.DOIComponent(newValue, 0.01);
            last.range = attrs.has(newValue) ? attrs.get(newValue).range || last.range : last.range;
            last.invert = attrs.has(newValue) ? attrs.get(newValue).invert || last.invert : last.invert;
            $scope.components.push(last);
            (<any>last).alias = $scope.getAttrAlias(newValue);
            $scope.setDirty(true);
          }
          $scope.toadd = defaultAttrLabel;
        });

        $scope.dirtyFlag = false;
        $scope.alpha = config.alpha || 0.3;
        $scope.beta = config.beta || 0.3;
        $scope.k = config.k || 20;
        $scope.deltaMethods = PVDDOI.DOIFormula.deltaMethods; //['local','global','both','localwindow'];
        $scope.deltaMethod = config.deltaMethod || 'localwindow';
        $scope.loadingPercentage = config.loadingPercentage || 0.25;

        function updateFormula() {
          rescale();
          if(config.fuzzyDays && $scope.k*0.25 > config.fuzzyDays) {
            console.warn('The configured K='+$scope.k+' is much bigger than the pre-defined fuzzyDays='+config.fuzzyDays+' -- consider a harmonization of these two values.');
          }

          // populate the inverted option to the attributes on nodes
          // IMPORTANT: the attr.values(), attr.valuesList() etc. will not be changed and still return the orignal values
          infrastructure.forEachAttr((attr) => {
            var comp = $scope.components.filter((c) => c.name === attr.name);
            if (comp.length > 0 && (<any>attr).invert !== undefined) {
              (<any>attr).invert = comp[0].invert;
            }
          });

          pvdDataSelection.doi = new PVDDOI.DOIFormula($scope.components.map((d) =>d.clone()),$scope.alpha, $scope.beta, $scope.k, config.default, config.range, config.step, config.fuzzyDays || 5, $scope.deltaMethod, $scope.loadingPercentage);
        }

        function rescale() {
          var sum = d3.sum($scope.components, (d: any) => d.weight);
          $scope.components.forEach((d) => d.weight /= sum);
          update();
        }

        $scope.setDirty = (bool) => {
          $scope.dirtyFlag = bool;
        };

        $scope.onSubmit = ($event) => {
          $scope.setDirty(false);
          updateFormula();
          $event.preventDefault();
          $event.stopPropagation();
          return false;
        };

        $scope.onRemove = (i) => {
          $scope.setDirty(true);
          $scope.components.splice(i, 1);
          rescale();
        };

        $scope.updateDynRange = () => {
          $scope.components.forEach((d) => {
            var attr = attrs.get(d.attr);
            if(attrs.get(d.attr).attr !== undefined) {
              attr = attrs.get(attrs.get(d.attr).attr);
            }
            if(attr.isNormalizeAble) {
              d.min = attr.min;
              d.max = attr.max;
            }
          });
          updateFormula();
        };

        var color = d3.scale.linear().domain([0,1]).range(['#f1eef6', '#3587bc']);
        var barMarginRight = 8;
        var $base = d3.select(element[0]).select('div.stacked_bar')
            .style('width', (element[0].getBoundingClientRect().width - element.find('.toggle')[0].getBoundingClientRect().width - barMarginRight) + 'px');

        $scope.toggleDetail = () => {
          element.find('.doi_details').slideToggle();
          $base.style('width', (element[0].getBoundingClientRect().width - element.find('.toggle')[0].getBoundingClientRect().width - barMarginRight) + 'px');
          element.find('.toggle i').toggleClass('fa-caret-right').toggleClass('fa-caret-down');
        };

        //$scope.toggleDetail();

        pvdWindowResize.on('change.doieditor' + PVDVisualizations.nextID(), () => {
          $base.style('width', (element[0].getBoundingClientRect().width - element.find('.toggle')[0].getBoundingClientRect().width - barMarginRight) + 'px');
        });

        var bak_weights;
        var drag = d3.behavior.drag().on('dragstart', () => {
          //work with the originals
          bak_weights = $scope.components.map((d) => d.weight);
        }).on('drag',function (c) {
          var dx = d3.event.dx;
          var total = $((<any>$base.node())).width();
          var p = dx / total;
          var rem = 1 - c.weight;
          $scope.components.forEach((d) => {
            d.weight += (d === c) ? p : -p*d.weight/rem;
          });
          updateFormula();
          $scope.$apply();
        });
        function update() {
          var bars = $base.selectAll('div.bar').data($scope.components);
          var bars_enter = bars.enter().append('div').classed('bar', true);
          bars_enter.append('span');
          bars_enter.append('div').classed('separator',true).call(drag);
          bars.attr('title', (d) => $filter('striphtml')($scope.getAttrAlias(d.name))+ ' ' +d3.round(d.percentage,0) + '%')
            .style('width', (d) => d.percentage + '%')
            .style('background-color', (d) => color(d.weight))
            .style('color', (d) => PVDVisualizations.idealTextColor(color(d.weight)));
          bars.select('span').html((d) => $scope.getAttrAlias(d.name) +  ' ' +d3.round(d.percentage,0) + '%');

          bars.select('div').classed('hidden', (d, i) => i >= $scope.components.length - 1);
          bars.exit().remove();
        }

        //check for formula changes
        pvdDataSelection.on('doi.refresh', (bak, new_) => {
          infrastructure.forEachAttr((attr) => {
            if (attr instanceof PVDModels.DOIAttribute) {
              (<PVDModels.DOIAttribute>(<any>attr)).setFormula(new_);
            }
          })
        });
        updateFormula();
      });
    },
    scope: {
      'infraId': '@?' // id of infrastructure*.json
    },
    restrict: 'EA'
  };
}).directive('inputCurrency', function ($filter, $locale) {
  return {
    terminal: true,
    restrict: 'A',
    require: '?ngModel',
    link: function (scope, element, attrs, ngModel) {

      if (!ngModel)
        return; // do nothing if no ng-model

      // get the number format
      var formats = $locale.NUMBER_FORMATS;

      // construct the currency prefix
      var outer = angular.element('<div />').addClass('input-group');
      var span = angular.element('<span />').addClass('input-group-addon').html(formats.CURRENCY_SYM).appendTo(outer);

      // insert it on the page and add the input to it
      //outer.insertBefore(element);
      //element.appendTo(outer).addClass('numeric');

      // fix up the incoming number to make sure it will parse into a number correctly
      var fixNumber = function (number) {
        if (number) {
          if (typeof number !== 'number') {
            number = number.replace(',', '');
            number = parseFloat(number);
          }
        }
        return number;
      };

      // function to do the rounding
      var roundMe = function (number) {
        number = fixNumber(number);
        if (number) {
          return $filter('number')(number, 2);
        }
      };

      // Listen for change events to enable binding
      element.bind('blur', function () {
        element.val(roundMe(ngModel.$modelValue));
      });

      // push a formatter so the model knows how to render
      ngModel.$formatters.push(function (value) {
        if (value) {
          return roundMe(value);
        }
      });

      // push a parser to remove any special rendering and make sure the inputted number is rounded
      ngModel.$parsers.push(function (value) {
        if (value) {
          return fixNumber(roundMe(value));
        }
      });
    }
  };
})
.filter('striphtml', function() {
  return function(input) {
    input = input || '';
    return input.replace(/<\/?[^>]+(>|$)/g, '');
  };
});
}

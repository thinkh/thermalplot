/**
 * Created by Samuel Gratzl on 23.04.2014.
 */
/// <reference path="../../../../tsd.d.ts" />

/**
 * idea is to have a grid of cells showing the current value of an attribute, time is encoded in time
 */
module PVDVisualizations {
  export class PVDBlickingArea<T> implements IAnimateable {
    private $r:D3.UpdateSelection;
    colorer:IColorer<T> = defaultColorer;

    private _lastTime = NaN;

    constructor(private attrs:PVDModels.IAttribute<T>[], $parent:D3.Selection, private pvdDataSelection:PVDDataSelection, grid:number[] = [10, 10]) {
      this.$r = $parent.selectAll("rect").data(attrs);
      var wi = 100 / grid[0];
      var hi = 100 / grid[1];
      var total = grid[0] * grid[1];
      this.$r.enter()
        .append("rect")
        .attr("width", wi + "%").attr("x", (_, i) => ((i % total) * wi) + "%")
        .attr("height", hi + "%").attr("y", (_, i) => (~~(i / total) * hi) + "%") //integer division see http://stackoverflow.com/questions/4228356/integer-division-in-javascript
        .append("title");

      var id =".blickingarea"+nextID();
      this.pvdDataSelection.on("change"+id, (act: PVDSelection) => {
        if (this.pvdDataSelection.isPinned) { //if we have a pinned selection update it
          this.updateImpl(act.point)
        }
      });
      onDelete($parent,() => {
        pvdDataSelection.on("change"+id, null);
      });
    }
    layout(dt:number, now: number) : any {
      return null;
    }
    update(dt:number, now:number) {
      //compute time to show
      var time = this.pvdDataSelection.getSelection(now).point;
      this.updateImpl(time);
    }

    private updateImpl(time: number) {
      var that = this;
      if (time === this._lastTime) { //no time change, no data change
        return;
      }
      this._lastTime = time;
      this.$r.each(function (attr:PVDModels.IAttribute<T>) {
        var v = attr.floor(time);
        var $this = d3.select(this);
        if (v) {
          $this.style("fill", that.colorer(v.v));
          $this.select("title").text(v.v);
        } else {
          $this.style("fill", "gray");
          $this.select("title").text("")
        }
      });
    }
  }

  angular.module('pipesVsDamsApp').directive('pvdBlickingArea', function (pvdAnimator:PVDAnimator, pvdDataSelection:PVDDataSelection, pvdInfrastructureLoader : PVDInfrastructureLoader) {
    return  {
      templateUrl: 'views/templates/BlickingArea.html',
      controller: function ($scope) {
      },
      compile: function(element, attrs:any) {
        //a place to define default attribute values
        attrs.frequencies = angular.isDefined(attrs.frequencies) ? attrs.frequencies : false;
        attrs.width = angular.isDefined(attrs.width) ? attrs.width : "100%";
        attrs.height = angular.isDefined(attrs.height) ? attrs.height : "32";
        attrs.infraId = angular.isDefined(attrs.infraId) ? attrs.infraId : '';

        if (!angular.isDefined(attrs.grid)) {
          var l = attrs.attrs.length;
          if (l < 8) {
            attrs.grid = [l, 1];
          }
          attrs.grid = [4, 4];
        }

        //return the postLink function
        return function ($scope, element) {
          //lazy get the infrastructure
          pvdInfrastructureLoader.get($scope.infraId).then((infrastructure:PVDModels.Infrastructure) => {
            var paths:string[] = $scope.paths;
            var attrs = new Array<PVDModels.IAttribute<any>>();
            paths.forEach((path) => {
              var attr = infrastructure.findAttr(path);
              if (attr) {
                attrs.push(attr);
              } else {
                console.warn("invalid attribute path: " + path);
              }
            });
            var $base = d3.select(element[0]).select(".blicking-area");
            $scope.$base = $base;
            if (attrs.length == 0) {
              element.text("Invalid or no attribute paths: " + paths.join(", "));
            } else {
              var area = new PVDBlickingArea(attrs, $base, pvdDataSelection, $scope.grid);
              pvdAnimator.push(area);
              $scope.area = area;
            }
          })
        }
      },
      scope: {
        'infraId' : '@?', //infrastructure id
        'paths': '=',
        'frequencies': '=?',
        'width': '@?',
        'height': '@?',
        'grid': '=?'
      },
      restrict: 'E'
    }
  })
}

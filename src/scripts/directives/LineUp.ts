/**
 * Created by Samuel Gratzl on 14.03.2015.
 */
/*
import * as angular from 'angular';
import * as d3 from 'd3';
import * as $ from 'jquery';
import LineUpJS from 'lineupjs/src';
import { ExternalNode, Infrastructure } from '../models/Infrastructure';
import { ConstantAttribute } from '../models/Models';
import ChangeBorderService, { PVDChangeBorder } from '../services/ChangeBorderService';
import DataSelection, { PVDDataSelection } from '../services/DataSelection';
import DataService, { PVDDataService } from '../services/DataService';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import WindowResize, { PVDWindowResize } from '../services/WindowResize';
import { nextID, onDelete } from './VisUtils';

export default angular.module('directives.pvdLineUp', [
  InfrastructureLoader,
  DataSelection,
  DataService,
  WindowResize,
  ChangeBorderService
])
  .directive('pvdLineUp', [
    'pvdInfrastructureLoaderr'
    'pvdDataSelectionr'
    'pvdDataServicer'
    'pvdWindowResizer'
    'pvdChangeBorder',
    function (
    pvdInfrastructureLoader: PVDInfrastructureLoader,
    pvdDataSelection: PVDDataSelection,
    pvdDataService: PVDDataService,
    pvdWindowResize: PVDWindowResize,
    pvdChangeBorder: PVDChangeBorder
  ) {

    function deriveData(attrs, nodes) {
      return nodes.map((n) => {
        var r: any = { name: n.name, title: n.title, fqname: n.fqIname, _: n };
        n.parents.forEach((p, i) => {
          r['p' + p.level] = p.title;
        });
        attrs.forEach((a) => {
          var attr = n.getAttr(a);
          r[a] = attr ? attr.getValue() : NaN;
        });
        return r;
      });
    }

    return {
      templateUrl: 'views/templates/LineUp.html',
      controller: function ($scope, $element, $timeout, $filter) {

        var config = {
          renderingOptions: {
            stacked: true,
            animation: false
          },
          htmlLayout: {
            headerHeight: 35,
            headerOffset: 1,
            buttonTopPadding: 5,
            labelLeftPadding: 2,
            buttonRightPadding: 10,
            buttonWidth: 7
          },
          svgLayout: {
            mode: 'combined',
            rowHeight: 18,
            rowPadding: 0.05,
            rowBarPadding: 1
          },
          interaction: {
            tooltips: false,
            multiselect: (e) => (e.ctrlKey || e.shiftKey || e.metaKey || e.altKey),
            rangeselect: (e) => (e.metaKey || e.altKey)
          }
        };
        var $container = d3.select($element[0]);
        $container.classed('compact', true);

        pvdInfrastructureLoader.get($scope.infraId).then((infrastructure: Infrastructure) => {
          var exconfig = infrastructure.visConfig.lineup;
          pvdDataService.when('constantsLoaded').then(() => {
            var desc = {
              columns: exconfig.columns,
              primaryKey: 'fqname',
              layout: exconfig.layout
            };

            var leaves = infrastructure.nodes().filter((n) => !n.has() && !(n instanceof ExternalNode));
            var attrs = d3.set();
            leaves.forEach((n) => {
              n.attrs().forEach((a) => {
                if (a instanceof ConstantAttribute) {
                  attrs.add(a.name);
                }
              })
            });

            var data = deriveData(attrs.values(), leaves);
            function createLineUp(desc, data) {
              var storage = LineUpJS.createLocalStorage(data, desc.columns);
              var l = LineUpJS.create(storage, $container, config);
              storage.restore({
                layout: desc.layout
              });
              return l;
            }
            $scope.lineup = createLineUp(desc, data);
            //$scope.lineup.on('selected', function(data) {
            //  pvdDataSelection.selection = (data ? data._: null);
            //});
            $scope.lineup.sortBy(exconfig.sortBy);
            $scope.lineup.on('hoverChanged', function (index) {
              pvdDataSelection.hover = (index >= 0 ? data[index]._ : null);
            });
            $scope.lineup.on('multiSelectionChanged', function (datas) {
              if (datas === null || datas.length === 0) {
                pvdDataSelection.clearSelection();
              } else if (datas.length === 1) {
                pvdDataSelection.selection = data[datas[0]]._;
              } else {
                pvdDataSelection.addBulkSelection(datas.map((d) => data[d]._));
              }
            });

            var id = '.lineup' + nextID();
            pvdDataSelection.on('selectall' + id, (selection, selections) => {
              //map to indices
              var indices = selections === null || selections.length === 0 ? [] : data.map((d, i) =>
                selections.indexOf(d._) >= 0 ? i : -1).filter((d) => d >= 0);
              $scope.lineup.data.setSelection(indices);
            });

            function rescale() {
              var elemRect = $element[0].parentNode.getBoundingClientRect();

              //var gridWidth = elemRect.width;
              var gridHeight = (pvdChangeBorder.horizontal !== undefined) ? pvdChangeBorder.horizontal.maxSize : (window.innerHeight - elemRect.top - 20); // 20px = body padding-bottom

              $container.style({
                //width: gridWidth + 'px',
                height: gridHeight + 'px'
              });
            }

            pvdWindowResize.on('change' + id, () => {
              rescale();
              $scope.$apply(() => {
                $scope.lineup.update();
              });
            });

            pvdChangeBorder.on('maxsize' + id, () => {
              rescale();
              $scope.$apply(() => {
                $scope.lineup.update();
              });
            });

            var bsListner = function (e) {
              rescale();
              $scope.lineup.update();
            };
            $('a[href="#lineup_tab"]').on('shown.bs.tab', bsListner);

            rescale();
            $scope.$apply(() => {
              $scope.lineup.update();
            });

            onDelete($container, () => {
              pvdDataSelection.on('selectall' + id, null);
              pvdWindowResize.on('change' + id, null);
              pvdChangeBorder.on('maxsize' + id, null);
              $('a[href="#lineup_tab"]').off('shown.bs.tab', bsListner);
            })
          });
        });

      },
      restrict: 'EA',
      scope: {
        'infraId': '@?' // id of infrastructure*.json
      }
    }
  }])
  .name; // name for export default
*/
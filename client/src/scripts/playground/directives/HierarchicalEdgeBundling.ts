import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';

'use strict';

angular.module('pipesVsDamsApp')
    .directive('pvdHeb', function () {
        var scopeData = {
            tension: {
                selected: 50,
                nonSelected: 85
            },
            // add CSS class to uncolor non selected edges on select any element
            uncolorEdges: true,
            data: []
        };

        d3.selection.prototype.appendTo = function (newParent) {
            return this.each(function () {
                newParent.appendChild(this);
            });
        };

        d3.selection.prototype.moveToFront = function () {
            return this.each(function () {
                this.parentNode.appendChild(this);
            });
        };

        d3.selection.prototype.moveToBack = function () {
            return this.each(function () {
                var firstChild = this.parentNode.firstChild;
                if (firstChild) {
                    this.parentNode.insertBefore(this, firstChild);
                }
            });
        };

        var packages = {
            minNodeSize: 0,
            maxNodeSize: 0,

            // Lazily construct the package hierarchy from class names.
            root: function (classes) {
                var map = {};

                function find(name: string, data: any = undefined): Object {
                    var node = map[name], i;
                    if (!node) {
                        node = map[name] = data || { name: name, children: [] };
                        if (name.length) {
                            node.parent = find(name.substring(0, i = name.lastIndexOf('.')));
                            node.parent.children.push(node);
                            node.key = name.substring(i + 1);
                        }
                        if (data && data.size) {
                            node.size = data.size;
                            packages.maxNodeSize = Math.max(packages.maxNodeSize, node.size);
                            packages.minNodeSize = Math.min(packages.minNodeSize, node.size);
                        }
                    }
                    return node;
                }

                classes.forEach(function (d) {
                    find(d.name, d);
                });

                return map[''];
            },

            // Return a list of imports for the given array of nodes.
            imports: function (nodes) {
                var map = {},
                    imports = [];

                // Compute a map from name to node.
                nodes.forEach(function (d) {
                    map[d.name] = d;
                });

                // For each import, construct a link from the source to target node.
                nodes.forEach(function (d) {
                    if (d.imports) {
                        d.imports.forEach(function (i) {
                            imports.push({ source: map[d.name], target: map[i] });
                        });
                    }
                });

                return imports;
            }

        };

        // from D3: d3SvgLineDot4()
        function d3SvgLineDot4(a, b) {
            return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
        }

        var d3SvgLineBasisBezier1 = [0, 2 / 3, 1 / 3, 0],
            d3SvgLineBasisBezier2 = [0, 1 / 3, 2 / 3, 0],
            d3SvgLineBasisBezier3 = [0, 1 / 6, 2 / 3, 1 / 6];

        var w = 700,
            h = 600,
            rx = w / 2,
            ry = h / 2,
            m0,
            rotate = 0;

        var div,
            svg,
            gNonSelectedPaths,
            gSelectedPaths;

        var cluster = d3.layout.cluster()
            .size([360, ry - 120])
            .sort(function (a: any, b: any) { return d3.ascending(a.key, b.key); });

        var bundle = d3.layout.bundle();

        var line = (<any>d3.svg.line.radial())
            //.interpolate('bundle')
            .interpolate(function (points, tension) {

                var i = -1,
                    n = points.length - 1,
                    x0 = points[0][0],
                    y0 = points[0][1];

                if (n) {
                    var dx = points[n][0] - x0,
                        dy = points[n][1] - y0,
                        p,
                        t;

                    while (++i <= n) {
                        p = points[i];
                        t = i / n;
                        p[0] = tension * p[0] + (1 - tension) * (x0 + t * dx);
                        p[1] = tension * p[1] + (1 - tension) * (y0 + t * dy);
                    }
                }

                /*var dots = svg.selectAll('circle.points')
                 .data(points)
                 .enter()
                 .append('svg:circle')
                 .attr('fill', function(d, i) { return (i==0 || i==points.length-1) ? 'black' : 'red'; })
                 .attr('r', function(d, i) { return 1; })
                 .attr('cx', function(d, i) { return d[0]; })
                 .attr('cy', function(d, i) { return d[1]; });
                 */

                // --> d3_svg_lineBasis()
                if (points.length < 3) { return points.join('L'); }

                i = 1;
                n = points.length;

                var pi,
                    px = [x0, x0, x0, (pi = points[1])[0]],
                    py = [y0, y0, y0, pi[1]],
                    path = [x0, ',', y0, 'L',
                        d3SvgLineDot4(d3SvgLineBasisBezier3, px), ',',
                        d3SvgLineDot4(d3SvgLineBasisBezier3, py)
                    ];

                points.push(points[n - 1]);

                while (++i <= n) {
                    pi = points[i];
                    px.shift();
                    px.push(pi[0]);
                    py.shift();
                    py.push(pi[1]);
                    // --> d3_svg_lineBasisBezier(path, px, py);
                    path.push('C',
                        d3SvgLineDot4(d3SvgLineBasisBezier1, px), ',',
                        d3SvgLineDot4(d3SvgLineBasisBezier1, py), ',',
                        d3SvgLineDot4(d3SvgLineBasisBezier2, px), ',',
                        d3SvgLineDot4(d3SvgLineBasisBezier2, py), ',',
                        d3SvgLineDot4(d3SvgLineBasisBezier3, px), ',',
                        d3SvgLineDot4(d3SvgLineBasisBezier3, py)
                    );
                    // <-- d3_svg_lineBasisBezier(path, px, py);
                }
                points.pop();
                path.push('L', pi);
                return path.join('');
                // <-- d3_svg_lineBasis()
            })
            //.tension(scope.tensionNonSelected / 100)
            .radius(function (d) { return d.y; })
            .angle(function (d) { return d.x / 180 * Math.PI; });

        function mouse(e) {
            return [e.pageX - rx, e.pageY - ry];
        }

        function mousedown() {
            m0 = mouse(d3.event);
            (<any>d3.event).preventDefault();
        }

        function mousemove() {
            if (m0) {
                var m1 = mouse(d3.event),
                    dm = Math.atan2(cross(m0, m1), dot(m0, m1)) * 180 / Math.PI;
                div.style('-webkit-transform', 'translateY(' + (ry - rx) + 'px)rotateZ(' + dm + 'deg)translateY(' + (rx - ry) + 'px)');
            }
        }

        function mouseup() {
            if (m0) {
                var m1 = mouse(d3.event),
                    dm = Math.atan2(cross(m0, m1), dot(m0, m1)) * 180 / Math.PI;

                rotate += dm;
                if (rotate > 360) { rotate -= 360; }
                else if (rotate < 0) { rotate += 360; }
                m0 = null;

                div.style('-webkit-transform', null);

                svg
                    .attr('transform', 'translate(' + rx + ',' + ry + ')rotate(' + rotate + ')')
                    .selectAll('g.node text')
                    .attr('dx', function (d) { return (d.x + rotate) % 360 < 180 ? 8 : -8; })
                    .attr('text-anchor', function (d) { return (d.x + rotate) % 360 < 180 ? 'start' : 'end'; })
                    .attr('transform', function (d) { return (d.x + rotate) % 360 < 180 ? null : 'rotate(180)'; });
            }
        }

        function cross(a, b) {
            return a[0] * b[1] - a[1] * b[0];
        }

        function dot(a, b) {
            return a[0] * b[0] + a[1] * b[1];
        }

        function visualize(scope, classes) {

            var nodes = cluster.nodes(packages.root(classes)),
                links = packages.imports(nodes),
                splines = bundle(links),
                selectedNodes = [],
                strokeWidth = d3.scale.linear().domain([packages.minNodeSize, packages.maxNodeSize]).range([1, 10]);

            function drawSplines(d, i) {
                if (selectedNodes.indexOf(d.source.key) !== -1 || selectedNodes.indexOf(d.target.key) !== -1) {
                    line.tension(scopeData.tension.selected / 100);
                } else {
                    line.tension(scopeData.tension.nonSelected / 100);
                }
                return line(splines[i]);

            }

            function mouseover(d) {
                if (selectedNodes.indexOf(d.key) !== -1) {
                    (<any>d3.event).preventDefault();

                } else {
                    gNonSelectedPaths.selectAll('path.link.target-' + d.key)
                        .classed('target', true)
                        .each(updateNodes('source', true))
                        .appendTo(gSelectedPaths[0][0]);

                    gNonSelectedPaths.selectAll('path.link.source-' + d.key)
                        .classed('source', true)
                        .each(updateNodes('target', true))
                        .appendTo(gSelectedPaths[0][0]);
                }
            }

            function mouseout(d) {
                if (selectedNodes.indexOf(d.key) !== -1) {
                    (<any>d3.event).preventDefault();

                } else {
                    gSelectedPaths.selectAll('path.link.source-' + d.key)
                        .classed('source', false)
                        .each(updateNodes('target', false))
                        .appendTo(gNonSelectedPaths[0][0]);

                    gSelectedPaths.selectAll('path.link.target-' + d.key)
                        .classed('target', false)
                        .each(updateNodes('source', false))
                        .appendTo(gNonSelectedPaths[0][0]);
                }
            }

            function updateNodes(name, value) {
                return function (d) {
                    if (value) { this.parentNode.appendChild(this); }
                    gNonSelectedPaths.select('#node-' + d[name].key).classed(name, value);
                };
            }

            var path = gNonSelectedPaths.selectAll('path.link')
                .data(links)
                .enter().append('svg:path')
                .attr('style', function (d) { return 'stroke-width: ' + strokeWidth(Math.abs(d.source.size - d.target.size)); })
                .attr('class', function (d) { return 'link source-' + d.source.key + ' target-' + d.target.key; })
                .attr('d', drawSplines);


            svg.selectAll('g.node')
                .data(nodes.filter(function (n) { return !n.children; }))
                .enter().append('svg:g')
                .attr('class', 'node')
                .attr('id', function (d) { return 'node-' + d.key; })
                .attr('transform', function (d) { return 'rotate(' + (d.x - 90) + ')translate(' + d.y + ')'; })
                .append('svg:text')
                .attr('dx', function (d) { return d.x < 180 ? 8 : -8; })
                .attr('dy', '.31em')
                .attr('text-anchor', function (d) { return d.x < 180 ? 'start' : 'end'; })
                .attr('transform', function (d) { return d.x < 180 ? null : 'rotate(180)'; })
                .text(function (d) { return d.key; })
                .on('mouseover', mouseover)
                .on('mouseout', mouseout)
                .on('click', function (d) {
                    var idx = selectedNodes.indexOf(d.key);

                    // unselect item
                    if (idx !== -1) {
                        selectedNodes.splice(idx, 1);
                        svg.select('#node-' + d.key).classed('selected', false);

                        // select item
                    } else {
                        selectedNodes.push(d.key);
                        svg.select('#node-' + d.key).classed('selected', true);
                    }

                    console.log(selectedNodes);

                    if (scopeData.uncolorEdges) {
                        svg.classed('selected-nodes', (selectedNodes.length > 0));
                    } else {
                        svg.classed('selected-nodes', false);
                    }

                    path.attr('d', drawSplines);
                });

            scope.redrawEdges = function () {
                path.attr('d', drawSplines);
            };

            scope.doUncolorEdges = function () {
                svg.classed('selected-nodes', scopeData.uncolorEdges);
            };
        }

        function link(scope, element) {
            // get scope variables
            scopeData.tension.selected = scope.tensionSelected || scopeData.tension.selected;
            scopeData.tension.nonSelected = scope.tensionNonSelected || scopeData.tension.nonSelected;
            scopeData.uncolorEdges = scope.uncolorEdges || scopeData.uncolorEdges;

            // Chrome 15 bug: <http://code.google.com/p/chromium/issues/detail?id=98951>
            div = d3.select(element[0])
                .style('width', w + 'px')
                .style('height', w + 'px')
                .style('-webkit-backface-visibility', 'hidden');

            svg = div.append('svg:svg')
                .attr('width', w)
                .attr('height', w)
                .append('svg:g')
                .attr('transform', 'translate(' + rx + ',' + ry + ')');

            svg.append('svg:path')
                .attr('class', 'arc')
                .attr('d', d3.svg.arc().outerRadius(ry - 120).innerRadius(0).startAngle(0).endAngle(2 * Math.PI))
                .on('mousedown', mousedown);

            gNonSelectedPaths = svg.append('g').attr('id', 'nonSelectedPaths');
            gSelectedPaths = svg.append('g').attr('id', 'selectedPaths');

            d3.select(window)
                .on('mousemove', mousemove)
                .on('mouseup', mouseup);

            scope.$watch('data', function (newData) {
                if (!newData) {
                    return;
                }

                console.log('visualize', newData);

                if (newData.length > 0) {
                    scopeData.data = newData.slice(0); // copy

                    // visualize with data
                    visualize(scope, scopeData.data);
                }
            });

            scope.$watch('tensionSelected', function (newData) {
                if (newData) {
                    scopeData.tension.selected = newData;
                    if (scope.redrawEdges) {
                        scope.redrawEdges();
                    }
                }
            });

            scope.$watch('tensionNonSelected', function (newData) {
                if (newData) {
                    scopeData.tension.nonSelected = newData;
                    if (scope.redrawEdges) {
                        scope.redrawEdges();
                    }
                }
            });

            scope.$watch('uncolorEdges', function (newData) {
                scopeData.uncolorEdges = newData;
                if (scope.doUncolorEdges) {
                    scope.doUncolorEdges();
                }
            });
        }

        return {
            scope: {
                'data': '=',
                'tensionSelected': '=',
                'tensionNonSelected': '=',
                'uncolorEdges': '='
            },
            restrict: 'E',
            link: link
        };
    });

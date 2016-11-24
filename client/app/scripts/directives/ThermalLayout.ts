/**
 * Created by Holger Stitz on 19.11.2014.
 */
/// <reference path='../../../tsd.d.ts' />
/*global d3 Physics*/
'use strict';

module PVDVisualizations {

  export class PVDThermalLayout implements PVDElementParent, IAnimateable {

    hierarchy = {
      parent : (node) => this.parentCb(node),
      parents : (node) => this.parentsCb(node),
      hasChildren: (node) => this.hasChildrenCb(node),
      scaleFactor : (node) => this.scaleFactorCb(node),
      children : (node) => this.childrenCb(node),
      isSelected : (node) => {
        var r = this.nodesMap.get(node.fqIname);
        return r.selected || r.highlighted;
      }
    };

    private layouter_:PVDLayouts.IPVDLayout;
    private isLayoutDirty:boolean = false;

    private world;
    private renderer;
    private worldBehavior = {
      edgeBounce: undefined, // initialize later with necessary aabb parameter
      bodyCollisionDetection: Physics.behavior('body-collision-detection'),
      bodyImpulseResponse: Physics.behavior('body-impulse-response'),
      sweepPrune: Physics.behavior('sweep-prune')
    };
    private viewportBounds;

    private bodiesMap:D3.Map<any> = d3.map();
    private nodesMap:D3.Map<PVDHierarchyNode> = d3.map();
    private currentSelection = [];
    private lasso;
    private trajectories:Trajectories;
    private hoverHalo:HoverHalo;
    private hoverBody;

    private deltaTime:number = 1; // in [s]

    private layoutConfig:PVDHierarchyLayoutConfig;
    private $physics;
    private $physicsDebug;
    private $lasso;

    constructor(private $root, private infra:PVDModels.Infrastructure,
                private config: PVDHierarchyConfig, private isStandalone) {
      this.applyViewportSize();
      this.attachListener();
      this.initLayout(infra);
    }

    /**
     * Calculates a space-filling grid rectangle and
     * sets the range for the x-axis and y-axis
     */
    private applyViewportSize() {
      var that = this;

      var bodyRect = document.body.getBoundingClientRect(),
          bodyStyle = (<any>document.body).currentStyle || window.getComputedStyle(document.body),
          elemRect = this.$root.node().parentNode.getBoundingClientRect(),
          vOffset = elemRect.top - bodyRect.top,
          marginBottom = (parseInt(bodyStyle.paddingTop) + parseInt(bodyStyle.paddingBottom));

      that.config.gridWidth = parseInt(d3.select(this.$root.node().parentNode).style('width')) - that.config.changeBorder.vertical.marginStart;
      that.config.gridHeight = window.innerHeight - vOffset - that.config.changeBorder.vertical.marginStart; //- marginBottom; // space-filling in height

      that.config.changeBorder.vertical.maxSize = that.config.gridWidth - that.config.changeBorder.vertical.marginEnd;
      that.config.changeBorder.horizontal.maxSize = that.config.gridHeight - that.config.changeBorder.horizontal.marginEnd;

      // this triggers the resizing of ChangeRulers and Treemap!
      that.config.changeBorder.propagateMaxSize();

      that.$root.style({
        'width': (that.config.gridWidth) + 'px',
        'height': (that.config.gridHeight) + 'px',
        'margin-left': that.config.changeBorder.vertical.marginStart + 'px',
        'margin-top': that.config.changeBorder.horizontal.marginStart + 'px'
      });

      if(that.$physics !== undefined) {
        that.$physics
          .style('width', that.config.gridWidth + 'px')
          .style('height', that.config.gridHeight + 'px');
      }

      if(that.$physicsDebug !== undefined) {
        that.$physicsDebug
          .style('width', that.config.gridWidth + 'px')
          .style('height', that.config.gridHeight + 'px');
      }

      if(that.trajectories !== undefined) {
        that.trajectories.resize(that.config.gridWidth, that.config.gridHeight);
      }

      if(that.$lasso !== undefined) {
        that.$lasso
          .style('width', that.config.gridWidth + 'px')
          .style('height', that.config.gridHeight + 'px');
      }
    }

    /**
     * Attach and removes the listener for this layout
     */
    private attachListener():void {
      var that = this;

      var id = '.thermal' + nextID();

      // initialize layout again and add the new node to DOM
      this.infra.on('addNode'+id, (newNode) => {
        this.dropInBody(newNode);
        this.initNewNodes();
      });

      // window resize
      this.config.windowResize.on('change' + id, () => {
        that.applyViewportSize();

        // update physics variables
        that.renderer.el.width = that.config.gridWidth;
        that.renderer.el.height = that.config.gridHeight;

        that.viewportBounds = Physics.aabb(0, 0, that.config.gridWidth, that.config.gridHeight);
        // update the boundaries
        if(that.worldBehavior.edgeBounce !== undefined) {
          that.worldBehavior.edgeBounce.setAABB(that.viewportBounds);
        }
      });

      // select other infra
      this.config.selection.on('infra' + id,
        (newInfra:PVDModels.Infrastructure, oldInfra:PVDModels.Infrastructure) => {
          if(oldInfra !== null) {
            this.$root
              .classed('infra-' + oldInfra.id, false)
              .classed('color-' + oldInfra.color, false);
          }
          if(newInfra !== null) {
            this.$root
              .classed('infra-' + newInfra.id, true)
              .classed('color-' + newInfra.color, true);
            this.initLayout(newInfra);
          }
        }
      );

      this.config.changeBorder.on('segrep' + id, (newSegRep) => {
        that.bodiesMap.forEach((fqname, body) => {
          if(body.currSegmentRep === newSegRep) {
            that.updateBodiesRep(newSegRep, that.nodesMap.get(fqname), body, true); // force body update
          }
        });
      });

      this.config.changeBorder.on('rep_layout_coord'+id, (infra, isFirstCall, positions, offset) => {
        that.bodiesMap.forEach((fqname, body) => {
          if(body === null) { return; }
          var pos = positions.get(fqname);

          if(pos === undefined || pos === null) {
            //body.hidden = true;
            body.origPos.x = that.config.changeBorder.vertical.centerAbsPos();
            body.origPos.y = that.config.changeBorder.horizontal.centerAbsPos();
            body.origSegmentRep = that.config.changeBorder.segmentRepByPos(body.origPos.x, body.origPos.y);
            return;
          }

          body.origPos.x = pos.x + offset.left;
          body.origPos.y = pos.y + offset.top;
          body.origPos.width = pos.width;
          body.origPos.height = pos.height;
          body.origSegmentRep = that.config.changeBorder.segmentRepByPos(body.origPos.x, body.origPos.y);

          if(body.expSegmentRep === undefined) {
            body.expSegmentRep = body.origSegmentRep;
          }

          if(isFirstCall) {
            that.resetBodyPosition(body, that.nodesMap.get(fqname));
          }
        });
      });

      this.config.animator.on('start' + id, () => {
        if(that.world !== undefined) {
          that.world.unpause();
        }
      });

      this.config.animator.on('stop' + id, () => {
        if(that.world !== undefined) {
          that.world.pause();
        }
      });

      this.config.layout.on('layout' + id, (layoutConfig:PVDHierarchyLayoutConfig) => {
        that.deltaTime = parseInt(layoutConfig.deltaTime);

        var body;
        that.bodiesMap.forEach((fqname) => {
          body = that.bodiesMap.get(fqname);
          body.cof = parseFloat(layoutConfig.physicsOptions.bodies.friction);
          body.mass = parseFloat(layoutConfig.physicsOptions.bodies.mass);
          body.restitution = parseFloat(layoutConfig.physicsOptions.bodies.restitution);
        });

        that.toggleWorldBehavior();
      });

      this.config.selection.on('selectall'+id, (newNode, allNodes, oldNodes) => {
        that.$root.classed('selection-enabled', (allNodes.length > 0));
        var isSelected;
        that.nodesMap.forEach((fqname, nodeEl) => {
          isSelected = (allNodes.indexOf(nodeEl.node) > -1);
          that.bodiesMap.get(fqname).showTrajectory = isSelected;
          nodeEl.$node.classed('hg-selected', isSelected);
        });
        that.currentSelection = allNodes;
        that.trajectories.currentSelection = allNodes;
      });

      this.config.selection.on('hover'+id, (newNode, oldNode) => {
        //if(that.layoutConfig.showTrajectories) {
          if(newNode !== null && that.bodiesMap.has(newNode.fqIname)) {
            var body = that.bodiesMap.get(newNode.fqIname),
              anchorPos = body.state.pos.clone().add(body.offset);
            that.hoverBody = body;
            that.hoverHalo.fadeIn().pos(anchorPos.x, anchorPos.y);
          } else {
            that.hoverBody = undefined;
            that.hoverHalo.fadeOut();
          }
        //}
        that.trajectories.hover(newNode);
      });
      this.config.selection.on('hoverTime'+id, (newTS) => {
        if(that.layoutConfig.showTrajectories === false) {
          return;
        }

        var newNode = this.config.selection.hover;
        if (newTS >= 0 && newNode !== null && that.bodiesMap.has(newNode.fqIname)) {
            var body = that.bodiesMap.get(newNode.fqIname);
            var act = this.computeActivity(newNode,new PVDSelection(newTS,this.config.selection.past,0,this.config.selection.steps),this.config.selection.doi);
            var expectX = that.config.changeBorder.vertical.actToPos(act.act),
            expectY = that.config.changeBorder.horizontal.actToPos(act.delta);

            that.hoverHalo.fadeIn().pos(expectX, expectY);
        }
      });

      // remove listener on delete
      this.config.animator.push(this);
      onDelete(this.$root, () => {
        this.infra.on('addNode'+id, null);
        that.world.destroy();
        this.config.animator.remove(this);
        this.config.windowResize.on('change' + id, null);
        this.config.selection.on('infra' + id, null);
        this.config.changeBorder.on('segrep' + id, null);
        this.config.changeBorder.on('rep_layout_coord' + id, null);
        this.config.changeBorder.on('drag' + id, null);
        this.config.animator.on('start' + id, null);
        this.config.animator.on('stop' + id, null);
        this.config.layout.on('layout' + id, null);
        this.config.selection.on('selectall'+id, null);
        this.config.selection.on('hover'+id, null);
      });
    }

    /**
     * Init layout with current infrastructure
     * @param infra
     */
    private initLayout(infra:PVDModels.Infrastructure):void {
      var that = this;

      this.infra = infra;

      if(this.$root === null) {
        return;
      }

      // get first layout config, because we don't have different configs per perspective
      this.layoutConfig = this.config.layout.getFirstLayoutConfig();

      // hide tooltip after hierarchy change
      tooltip().hide();

      // delete everything
      this.$root.selectAll(':not(.hg-edge-overlay)').remove();
      this.$root
        .attr('data-infra-id', infra.id)
        .classed('infra-' + infra.id, true)
        .classed('color-' + infra.color, true);

      //var trajectories = this.$root.append('svg')
      //  .attr('id', 'trajectories')
      //  .style({
      //    width: this.config.gridWidth + 'px',
      //    height: this.config.gridHeight + 'px'
      //  });
      //this.trajectories = new Trajectories(trajectories, this.config);
      var trajectories = this.$root.append('canvas')
        .attr('id', 'trajectories')
        .attr({
          width: this.config.gridWidth,
          height: this.config.gridHeight
        });
      this.trajectories = new WebGLTrajectories(trajectories, this.config);

      // append basic elements
      this.$physics = this.$root.append('div').attr('id', 'physics');

      this.hoverHalo = new HoverHalo(this.$root);
      this.hoverHalo.hide();

      this.$physicsDebug = this.$root.append('svg')
        .attr('id', 'physics-debug')
        .style({
          width: this.config.gridWidth + 'px',
          height: this.config.gridHeight + 'px'
        });

      this.bodiesMap = d3.map();
      this.nodesMap = d3.map();

      this.initLasso();

      if(this.world !== undefined) {
        this.world.destroy();
      }

      Physics((world) => {
        this.world = world;
        this.initWorld(world);
      });
    }

    private initLasso() {
      var that = this;

      that.$lasso = that.$root.append('svg')
        .attr('id', 'lasso')
        .style('width', that.config.gridWidth + 'px')
        .style('height', that.config.gridHeight + 'px');

      var posStart, posEnd;

      // Lasso functions to execute while lassoing
      var lasso_start = function() {
        that.$root.classed('lasso-active', true);
        // reset items
        that.lasso.items().classed({'hg-selected':false});
        var mouse = d3.mouse(that.$lasso.node());
        posStart = new Physics.vector(mouse[0], mouse[1]);
      };

      var lasso_draw = function() {
        that.lasso.items().classed('hg-selected', (d) => d.possible);

        var mouse = d3.mouse(that.$lasso.node());
        posEnd = new Physics.vector(mouse[0], mouse[1]);

        var selection = that.lasso.items().filter(function(d) { return d.possible });
        var nodes:PVDModels.Node[] = [];

        if(selection[0].length > 0) {
          selection.each(function(d) { // d3.selectAll() collection
            var fqname = d3.select(this).attr('data-fqname');
            if(that.nodesMap.has(fqname)) {
              nodes.push(that.nodesMap.get(fqname).node);
            }
          });

          // if click almost same start and end position
        } else if(posStart.dist(posEnd) < 10) {
          var dist = 0, minDist = 15;
          that.bodiesMap.forEach((fqname, body) => {
            // distance from mouse to anchor vector
            dist = posEnd.dist(body.state.pos.clone().add(body.offset));
            if(dist < minDist) { // find closest node
              nodes[0] = body.node.node;
              minDist = dist;
            }
          });
        }
        that.config.selection.addBulkSelection(nodes);
        that.$root.classed('selection-enabled', false); // still in lasso mode -> remove selection class
      };

      var lasso_end = function() {
        that.$root.classed('lasso-active', false);

        var mouse = d3.mouse(that.$lasso.node());
        posEnd = new Physics.vector(mouse[0], mouse[1]);

        var selection = that.lasso.items().filter(function(d) { return d.selected });
        var nodes:PVDModels.Node[] = [];

        if(selection[0].length > 0) {
          selection.each(function(d) { // d3.selectAll() collection
            var fqname = d3.select(this).attr('data-fqname');
            if(that.nodesMap.has(fqname)) {
              nodes.push(that.nodesMap.get(fqname).node);
            }
          });

        // if click almost same start and end position
        } else if(posStart.dist(posEnd) < 10) {
          var dist = 0, minDist = 15;
          that.bodiesMap.forEach((fqname, body) => {
            // distance from mouse to anchor vector
            dist = posEnd.dist(body.state.pos.clone().add(body.offset));
            if(dist < minDist) { // find closest node
              nodes[0] = body.node.node;
              minDist = dist;
            }
          });
        }

        that.$root.classed('selection-enabled', (nodes.length > 0));
        that.config.selection.addBulkSelection(nodes);
      };

      // Create the area where the lasso event can be triggered
      var lasso_area = that.$lasso.append('rect')
        .attr('width', '100%')
        .attr('height', '100%')
        .style('opacity',0);

      // Define the lasso
      that.lasso = (<any>d3).lasso()
        .itemOffset(angular.element(this.$root.node()).offset()) // max distance for the lasso loop to be closed
        .closePathDistance(75) // max distance for the lasso loop to be closed
        .closePathSelect(true) // can items be selected by closing the path?
        .hoverSelect(true) // can items by selected by hovering over them?
        .area(lasso_area) // area where the lasso can be started
        .on('start',lasso_start) // lasso start function
        .on('draw',lasso_draw) // lasso draw function
        .on('end',lasso_end); // lasso end function

      // Init the lasso on the svg:g that contains the dots
      that.$lasso.call(that.lasso);
    }

    private updateBodiesAtChangeBorder() {
      var that = this;
      var body, node:PVDHierarchyNode, segmentRep;

      if(that.hoverBody !== undefined) {
        var anchorPos = that.hoverBody.state.pos.clone().add(that.hoverBody.offset);
        that.hoverHalo.pos(anchorPos.x, anchorPos.y);
      }

      // update block representation on crossing a border
      that.bodiesMap.forEach(function updateEachBody(fqname) {
        body = that.bodiesMap.get(fqname);
        node = that.nodesMap.get(fqname);

        if(isNaN(body.state.pos.x) || isNaN(body.state.pos.y)) {
          console.warn('reset position', node.node.name, body.state.pos);
          that.resetBodyPosition(body, node);
        }

        segmentRep = that.config.changeBorder.segmentRepByPos(body.state.pos.x, body.state.pos.y, body.showTrajectory);

        // use the alternative visConfig representation for the treemap segment
        // (because there is no treemap in the standalone mode)
        if(that.isStandalone === true) {
          segmentRep.applyBehavior('treemapCollapse');
        }

        if(segmentRep === undefined) {
          //console.error(fqname, body.state.pos.x);
          body.currSegmentRep = undefined;
          return;
        }

        if(body.currSegmentRep !== segmentRep) {
          that.config.changeBorder.crossed(node.node, segmentRep, body.currSegmentRep);
          body.currSegmentRep = segmentRep;
          that.updateBodiesRep(segmentRep, node, body);
        }

        // always update body offset
        body.offset.x = -node.anchorPoint()[0];
        body.offset.y = -node.anchorPoint()[1];

        if(body.currSegmentRep && body.currSegmentRep.isHidden('ThermalLayout')
          && that.isStandalone === false) { // only in conjunction with the treemap
          node.hide();
          body.hidden = true;

          // reset position for body if in expPos is also hidden
          if(body.expSegmentRep !== undefined && body.expSegmentRep.isHidden('ThermalLayout')) {
            that.resetBodyPosition(body, node);
          }

        } else {
          body.sleep(false);
          node.show();
          body.hidden = false;
        }
      });
    }

    private resetBodyPosition(body, node) {
      body.sleep(true);
      body.useOrigPos();
      node.relayout(body.geometry.options.width, body.geometry.options.height);
    }

    private updateBodiesRep(newSegRep, node:PVDHierarchyNode, body, forceUpdate = false) {
      var that = this;
      var wasModified = modifyConfig(that.config, node.node.infrastructure, newSegRep.visConfigId);
      // nothing changed at the config
      if(forceUpdate === false && wasModified === false) {
        return;
      }
      node.setDefaultScaleFactor(that.config);
      node.children(that.config.showInNode(node.hasNodeChildren(), node.node));
      node.relayout(that.config.nodeWidth, node.scaleFactor[1] * that.config.sliceHeight);
      body.update({
        width: that.config.nodeWidth,
        height: node.scaleFactor[1] * that.config.sliceHeight
      });
    }

    private renderOverlays() {
      if(this.layoutConfig.showPhysicsBodies) {
        this.showPhysicsBodies(this.bodiesMap.values().filter((d) => !d.node.hasNodeChildren()));
      } else {
        this.showPhysicsBodies([]);
      }

      if(this.layoutConfig.showTrajectories) {
        this.trajectories.show(this.trajectories.bodies.filter((d) => (d.showTrajectory)));
      } else {
        this.trajectories.show([]);
      }
    }

    private showPhysicsBodies(data) {
      var that = this;

      var conline = this.$physicsDebug
        .selectAll('.con-line')
        .data(data);

      conline.enter()
        .append('line')
        .classed('con-line', true)
        .attr('data-fqname', (d) => d.node.node.fqIname);

      conline
        .attr('x1', (d) => d.state.pos.x + d.offset.x)
        .attr('y1', (d) => d.state.pos.y + d.offset.y)
        .attr('x2', (d) => d.expPos.x)
        .attr('y2', (d) => d.expPos.y);

      conline.exit().remove();

      var shapes = this.$physicsDebug
        .selectAll('.shape')
        .data(data);

      shapes.enter()
        .append('rect')
        .classed('shape', true)
        .attr('data-fqname', (d) => d.node.node.fqIname);

      shapes
        .attr('x', (d) => d.state.pos.x + d.offset.x)
        .attr('y', (d) => d.state.pos.y + d.offset.y)
        .each((d, i) => {
          d.resizeSVGElement(d3.select(shapes[0][i]));
        });

      shapes.exit().remove();

      var exppos = this.$physicsDebug
        .selectAll('.exp-pos')
        .data(data);

      exppos.enter()
        .append('circle')
        .classed('exp-pos', true)
        .attr('data-fqname', (d) => d.node.node.fqIname)
        .attr('r', 2);
        /*.on('mouseenter', (d) => {
          PVDVisualizations.tooltip().mouseover(this.createTooltip(d.node.node.name, d.act));
        })
        .on('mousemove', (d) => {
          PVDVisualizations.tooltip().update(this.createTooltip(d.node.node.name, d.act));
          PVDVisualizations.tooltip().mousemove();
        })
        .on('mouseleave', (d) => {
          PVDVisualizations.tooltip().mouseout();
        });*/

      exppos
        .attr('cx', (d) => d.expPos.x)
        .attr('cy', (d) => d.expPos.y);

      exppos.exit().remove();
    }

    /**
     * Init physics world of the layout
     * @param world
     */
    private initWorld(world) {
      var that = this;

      that.deltaTime = parseInt(that.layoutConfig.deltaTime);

      that.renderer = Physics.renderer('dom', {
        el: 'physics', // div#id
        width: that.config.gridWidth,
        height: that.config.gridHeight,
        meta: false, // don't display meta data
        styles: {}
      });

      // over write the default connect/disconnect functions
      // otherwise PhysicsJS will attach and remove the body's view
      // and trigger the PVDHierarchyNode onDelete() function,
      // which results in broken/disconnected children (streamgraphs, etc)
      that.renderer.connect = function(world) {};
      that.renderer.disconnect = function(world) {};

      // add the renderer
      world.add(that.renderer);

      // render on each step
      world.on('step', function onStep() {
        that.updateBodiesAtChangeBorder();
        that.renderOverlays();

        // prevent body rotation
        that.bodiesMap.forEach((fqname, body) => {
          // if body collision off, animate quicker to exp position
          if(that.layoutConfig.bodyCollisionDetection === false) {
            body.state.vel.x = (body.expPos.x === body.state.pos.x) ? 0 : (body.expPos.x - body.state.pos.x) / 50;
            body.state.vel.y = (body.expPos.y === body.state.pos.y) ? 0 : (body.expPos.y - body.state.pos.y) / 50;
          }

          body.state.angular.pos = 0;
          body.state.angular.vel = 0;
        });

        world.render();
      });

      /*world.on('collisions:detected', function(collisions) {
        console.log(collisions);
      });*/

      //nodes.push(that.infra.external);
      function traverse(n: PVDModels.Node, level) {
        if(n.children().length === 0) {
          that.dropInBody(n);
        } else {
          n.children().forEach((c) => traverse(c, level));
        }
      }
      traverse(that.infra.root, 0);

      that.initNewNodes();

      // layout the nodes
      that.config.changeBorder.requestLayoutCoordinates(that.infra, true);

      // add things to the world
      world.add([
        //Physics.integrator('velocity-verlet', { drag: 0.1 }) // drag applied during integration: 0 means vacuum, 0.9 means molasses
        //Physics.integrator('verlet', { drag: 0.1 }),
        //Physics.integrator('improved-euler', { drag: 0.1 }),
      ]);

      that.viewportBounds = Physics.aabb(0, 0, that.config.gridWidth, that.config.gridHeight);
      that.toggleWorldBehavior();

      var lastTime = 0,
          timeThreshold = 50; // in [ms]
      // subscribe to ticker to advance the simulation
      Physics.util.ticker.on(function( time, dt ){
        if(time - lastTime <= timeThreshold) {
          return;
        }
        world.step( time );
        lastTime = time;
      });

      // start the ticker
      Physics.util.ticker.start();
    }

    private dropInBody(node: PVDModels.Node){
      var that = this;

      var nodeEl = new PVDHierarchyNode(node, that.$physics, that.config, that);
      //nodeEl.addTimelineHighlight();
      nodeEl.children(that.config.showInNode(nodeEl.hasNodeChildren(), node));
      nodeEl.show();

      var nodeHeight = nodeEl.scaleFactor[1] * that.config.sliceHeight,
          phyOptBd = that.layoutConfig.physicsOptions.bodies;

      //var body = Physics.body('pvd-compound-node', {
      var body = Physics.body('pvd-rectangle', {
        hidden: false,
        node: nodeEl,
        // what is the view object (mixed) that should be used when rendering?
        view: nodeEl.$node[0][0],
        //width: that.config.nodeWidth,
        //height: nodeHeight,
        //x: that.config.changeBorder.vertical.actToPos(0),
        //y: that.config.changeBorder.horizontal.actToPos(0),
        //y: that.bodiesMap.size() * (nodeHeight + that.nodeSpacing) + (nodeHeight / 2),
        // the vector offsetting the geometry from its center of mass
        offset: Physics.vector(0,0),
        treatment: 'dynamic',
        // body mass
        mass: parseFloat(phyOptBd.mass),
        // body restitution. How 'bouncy' is it?
        restitution: parseFloat(phyOptBd.restitution),
        // what is its coefficient of friction with another surface with COF = 1?
        cof: parseFloat(phyOptBd.friction)
      });

      body.expPos.x = that.config.changeBorder.vertical.centerAbsPos();
      body.expPos.y = that.config.changeBorder.horizontal.centerAbsPos();

      nodeEl.relayout(that.config.nodeWidth, nodeHeight);

      // add all nodeEl to map to compute the layout (that.layouter)
      that.nodesMap.set(node.fqIname, nodeEl);

      // add only child bodies to world, because intermediate stay fixed
      that.bodiesMap.set(node.fqIname, body);
      that.world.add(body);
    }

    private initNewNodes() {
      var that = this;

      that.lasso.items(that.$physics.selectAll('.hg-node'));

      // get the current style of the first segment
      this.updateBodiesAtChangeBorder();
    }


    private toggleWorldBehavior() {
      var that = this;

      if(that.layoutConfig.bodyCollisionDetection) {
        that.world.remove(that.worldBehavior.edgeBounce);

        console.log(that.viewportBounds);
        // bounds of the window
        var phyOptEc = that.layoutConfig.physicsOptions.edgeCollision;
        that.worldBehavior.edgeBounce = Physics.behavior('edge-collision-detection', {
          aabb: that.viewportBounds,
          restitution: parseFloat(phyOptEc.restitution),
          cof: parseFloat(phyOptEc.friction)
        });

        //Physics.behavior('interactive', { el: that.renderer.el }),
        // add some gravity
        //Physics.behavior('constant-acceleration', {
        //acc: { x:-0.000004, y:0 }
        //acc: { x : 0, y: 0.0004 } // this is the default
        //}),
        // ensure objects bounce when edge collision is detected
        //Physics.behavior('body-impulse-response'),
        //Physics.behavior('sweep-prune'),
        //that.edgeBounce,

        that.world.add([
          that.worldBehavior.sweepPrune,
          that.worldBehavior.bodyImpulseResponse,
          that.worldBehavior.bodyCollisionDetection,
          that.worldBehavior.edgeBounce
        ]);

      } else {
        that.world.remove([
          that.worldBehavior.sweepPrune,
          that.worldBehavior.bodyImpulseResponse,
          that.worldBehavior.bodyCollisionDetection,
          that.worldBehavior.edgeBounce
        ]);
      }
    }

    dirtyLayout() {
      this.isLayoutDirty = true;
    }

    relayout(width:number, height:number) {

    }

    focusOn(newroot:PVDModels.Node) {

    }

    collapsedChanged(node: PVDHierarchyNode) {

    }

    layout(dt:number, now: number) : any {

    }

    private computeActivity(node: PVDModels.Node, s: PVDSelection, f: PVDDOI.DOIFormula) {
      var w = PVDDOI.computeWindow(node,s, f);
      return {
        act: w.doi_t,
        prev : w.doi_prev,
        delta : w.delta_t
      };
    }

    private computeTrajectoriesActivities(node: PVDModels.Node, s: PVDSelection, f: PVDDOI.DOIFormula) {
      return PVDDOI.computeTrajectory(node, s, f).map((d) => [d.doi,d.delta]);
    }

    update(dt:number, now:number, layouted : any) : void {
      var that = this;
      var s = this.config.selection.getSelection(now); //this.config.dataRange(now, this.config.gridWidth);

      that.bodiesMap.forEach(function updateBodies(fqname) {
        var body = that.bodiesMap.get(fqname),
            node:PVDHierarchyNode = that.nodesMap.get(fqname);

        var act = that.computeActivity(node.node,s, that.config.selection.doi);

        //console.log(node.node.color);
        //node.node.color = that.config.changeBorder.vertical.actToColor(act.act);

        if(act === undefined) {
          return;
        }

        //if(node.node.name === 's4' || node.node.name === 'INH.DE' || node.node.name === 'Germany') {
        //  console.log(node.node.name, '--', 'act =', act.act, 'prev =', act.prev, 'delta =', act.delta);
        //}

        var currX = body.state.pos.x || that.config.changeBorder.vertical.centerAbsPos(),
            expectX = that.config.changeBorder.vertical.actToPos(act.act),
            deltaX = expectX - currX;

        body.state.vel.x = deltaX / 5000;

        //console.log('act', act.act, 'currX', currX, 'expectX', expectX, 'deltaX', deltaX);
        //console.log('vel.x', body.state.vel.x, 'acc.x', body.state.acc.x, 'vec.x', vec.x);

        var currY = body.state.pos.y || that.config.changeBorder.horizontal.centerAbsPos(),
            expectY = that.config.changeBorder.horizontal.actToPos(act.delta),
            deltaY = expectY - currY;

        body.state.vel.y = deltaY / 5000;

        if(body.expPos.x === expectX && body.expPos.y === expectY) {
          body.sleep(true);
          return;
        }

        body.sleep(false);

        body.expPos.x = expectX;
        body.expPos.y = expectY;
        body.expSegmentRep = that.config.changeBorder.segmentRepByPos(body.expPos.x, body.expPos.y, body.showTrajectory);

        //console.log('-----------------------');
      });

      // calculate trajectory
      if(that.layoutConfig.showTrajectories) {
        that.trajectories.bodies = that.bodiesMap.values()
          // NOTE: body.showTrajectory -> in worst case the body trajectory is calculate on the next update() call when the body has already crossed the border
          .filter((body) => (!body.node.hasNodeChildren() && body.showTrajectory))
          .map((body) => {
            body.trajectory = that.computeTrajectoriesActivities(body.node.node, s, that.config.selection.doi);
            return body;
          });
      }
    }

    get layouter() {
      return this.layouter_;
    }

    set layouter(layout: PVDLayouts.IPVDLayout) {
      layout.hasChildren = this.hierarchy.hasChildren;
      layout.children = this.hierarchy.children;
      layout.scaleFactor =  this.hierarchy.scaleFactor;
      layout.parent = this.hierarchy.parent;
      layout.isSelected = this.hierarchy.isSelected;
      //layout.inlayUp = this.inlayUp_;
      //layout.inlayDown = this.inlayDown_;
      this.layouter_ = layout;
    }

    hasChildrenCb(node:PVDModels.Node):boolean {
      var n = this.nodesMap.get(node.fqIname);
      if (n.collapsed) {
        return false;
      }
      return n.hasNodeChildren();
    }

    parentCb(node:PVDModels.Node): PVDModels.Node {
      if (node === this.layouter.rootNode) {
        return null;
      }
      return node.parent;
    }

    parentsCb(node:PVDModels.Node): PVDModels.Node[] {
      if (node === this.layouter.rootNode) {
        return [node];
      }
      return node.parents;
    }

    childrenCb(node:PVDModels.Node):PVDModels.Node[] {
      var n = this.nodesMap.get(node.fqIname);
      return n.nodeChildren();
    }

    private scaleFactorCb(node:PVDModels.Node):number[] {
      return this.nodesMap.get(node.fqIname).scaleFactor;
    }

    anchorPoint(position?:number[]) {

    }

    private createTooltip(name:string, act:any) {
      var r = ["<table class='statusinfo'><caption>"];
      r.push(name);
      r.push("</caption><thead><tr><th>Attribute</th><th>Value</th></tr></thead><tbody>");
      var prop;
      for(prop in act) {
        r.push("<tr><th>");
        r.push(prop);
        r.push("</th><td>");
        r.push(act[prop]);
        r.push("</td></tr>\n");
      };
      r.push("</tbody></table>");
      return r.join('');
    }

  }

  /**
   * Extend physics rectangle to store pvd node object
   */
  Physics.body('pvd-rectangle', 'rectangle', function( parent ){
    return {
      node: undefined,

      expPos: undefined,
      expSegmentRep: undefined,
      origPos: undefined,
      origSegmentRep: undefined,
      currSegmentRep: undefined,

      showTrajectory: undefined,
      trajectory: undefined,

      // optional initialization
      init: function( options ){
        // call parent init method
        parent.init.call(this, options);

        this.geometry = Physics.geometry('rectangle', {
          width: options.width,
          height: options.height
        });

        this.node = options.node;
        this.expPos = new Physics.vector();
        this.showTrajectory = false;
        this.trajectory = [];
        this.origPos = {width: 0, height: 0, x: 0, y: 0};

        this.recalc();
      },

      update: function(options) {
        this.geometry.options.width = this.geometry.width = options.width;
        this.geometry.options.height =  this.geometry.height = options.height;

        this.recalc();
      },

      addSVGElement: function($root) {
        var $el = $root.append('rect');
        this.resizeSVGElement($el);
        return $el;
      },

      resizeSVGElement: function($svgEl) {
        $svgEl.attr({
          'width': this.geometry.options.width,
          'height': this.geometry.options.height
        });
      },

      useOrigPos() {
        //this.expPos.x = this.origPos.x;
        //this.expPos.y = this.origPos.y;
        this.state.pos.x = this.origPos.x;
        this.state.pos.y = this.origPos.y;
        this.update(this.origPos);
        //this.state.vel.x = 0;
        //this.state.vel.y = 0;
        this.sleep(true);
      }
    };
  });

  class HoverHalo {

    private $svg;

    private radius = 20;
    private border = 5;

    constructor(public $root) {

      this.$svg = this.$root.append('svg')
        .attr('id', 'hover-halo')
        .style('width', 2*this.radiusAndBorder + 'px')
        .style('height', 2*this.radiusAndBorder + 'px');

      this.$svg.append('circle')
        .attr('cx', this.radiusAndBorder)
        .attr('cy', this.radiusAndBorder)
        .attr('r', this.radius);
    }

    get radiusAndBorder() {
      return this.radius + 2*this.border;
    }

    pos(x, y) {
      this.$svg
        .style('top', y - this.radiusAndBorder + 'px')
        .style('left', x - this.radiusAndBorder + 'px');
      return this;
    }

    show() {
      this.$svg.classed('hg-hidden', false);
      return this;
    }

    hide() {
      this.$svg.classed('hg-hidden', true);
      return this;
    }

    fadeOut() {
      this.$svg.transition().style('opacity',0).each('end',function() {
        d3.select(this).classed('hg-hidden', true).style('opacity', null);
      });
      return this;
    }

    fadeIn() {
      this.$svg
        .classed('hg-hidden', false).style('opacity', 0)
        .transition().duration(200)
        .style('opacity', 1).each('end',function() {
          d3.select(this).style('opacity', null);
        });
      return this;
    }
  }

  class Trajectories {

    public bodies = [];
    public currentSelection = [];

    protected line;
    protected color = d3.interpolateLab("#222223", "#ffffff");
    protected opacity = d3.scale.linear().range([0.1,1]);

    constructor(public $root, public config) {
      this.line = d3.svg.line()
        .x((d) => this.config.changeBorder.vertical.actToPos(d[0]))
        .y((d) => this.config.changeBorder.horizontal.actToPos(d[1]))
        .interpolate(config.interpolation || 'basis');
    }

    hover(node: PVDModels.Node) {
      this.$root.selectAll('.trajectory').classed('hg-hovered', (d) => d.node.node === node);
    }

    show(data) {
      var that = this;

      var $trajectories = that.$root
        .selectAll('.trajectory')
        .data(data, (body) => body.node.node.fqIname);

      $trajectories.enter()
        .append('path')
        .classed('trajectory', true)
        .attr('data-fqname', (d) => d.node.node.fqIname);

      $trajectories
        .classed('hg-selected', (d) => (that.currentSelection.indexOf(d.node.node) > -1))
        .attr('d', (d) => { return that.line(d.trajectory); });

      $trajectories.exit().remove();
    }

    resize(width: number, height: number) {
      this.$root
        .style('width', width + 'px')
        .style('height', height + 'px');
    }


    showWithOpacity(data) {
      var that = this;

      var $trajectories = that.$root
        .selectAll('g')
        .data(data, (body) => body.node.node.fqIname);

      $trajectories.enter()
        .append('g')
        .attr('data-fqname', (d) => d.node.node.fqIname);

      $trajectories
        .classed('hg-selected', (d) => (that.currentSelection.indexOf(d.node.node) > -1));

      $trajectories.exit().remove();


      var $paths = $trajectories.selectAll('path')
        .data((d) => {
          var quad:any[] = that.quad(that.sample(that.line(d.trajectory), 32));
          that.opacity.domain([quad[0].t, quad[quad.length-1].t]);
          return quad;
        });

      $paths.enter().append('path')
        .classed('trajectory', true);

      $paths
        //.style('fill', function(d) { return that.color(d.t); })
        //.style('stroke', function(d) { return that.color(d.t); })
        //.style('stroke-width', 0)
        //.style('stroke-opacity', 1)
        .style('opacity', (d) => that.opacity(d.t))
        .attr('d', function(d, i) { return that.lineJoin(d[0], d[1], d[2], d[3], 2); });

      $paths.exit().remove();
    }

    // https://gist.github.com/mbostock/4163057
    // Sample the SVG path string "d" uniformly with the specified precision.
    private sample(d, precision) {
      var path = document.createElementNS(d3.ns.prefix.svg, 'path');
      path.setAttribute('d', d);

      var n = (<any>path).getTotalLength(), t = [0], i = 0, dt = precision;
      while ((i += dt) < n) t.push(i);
      t.push(n);

      return t.map(function(t) {
        var p = (<any>path).getPointAtLength(t), a = [p.x, p.y];
        (<any>a).t = t / n;
        return a;
      });
    }

    // Compute quads of adjacent points [p0, p1, p2, p3].
    private quad(points) {
      return d3.range(points.length - 1).map(function(i) {
        var a = [points[i - 1], points[i], points[i + 1], points[i + 2]];
        (<any>a).t = (points[i].t + points[i + 1].t) / 2;
        return a;
      });
    }

    // Compute stroke outline for segment p12.
    private lineJoin(p0, p1, p2, p3, width) {
      var u12 = Trajectories.perp(p1, p2),
        r = width / 2,
        a = [p1[0] + u12[0] * r, p1[1] + u12[1] * r],
        b = [p2[0] + u12[0] * r, p2[1] + u12[1] * r],
        c = [p2[0] - u12[0] * r, p2[1] - u12[1] * r],
        d = [p1[0] - u12[0] * r, p1[1] - u12[1] * r];

      if (p0) { // clip ad and dc using average of u01 and u12
        var u01 = Trajectories.perp(p0, p1), e = [p1[0] + u01[0] + u12[0], p1[1] + u01[1] + u12[1]];
        a = Trajectories.lineIntersect(p1, e, a, b);
        d = Trajectories.lineIntersect(p1, e, d, c);
      }

      if (p3) { // clip ab and dc using average of u12 and u23
        var u23 = Trajectories.perp(p2, p3), e = [p2[0] + u23[0] + u12[0], p2[1] + u23[1] + u12[1]];
        b = Trajectories.lineIntersect(p2, e, a, b);
        c = Trajectories.lineIntersect(p2, e, d, c);
      }

      return 'M' + a + 'L' + b + ' ' + c + ' ' + d + 'Z';
    }

    // Compute intersection of two infinite lines ab and cd.
    private static lineIntersect(a, b, c, d) {
      var x1 = c[0], x3 = a[0], x21 = d[0] - x1, x43 = b[0] - x3,
        y1 = c[1], y3 = a[1], y21 = d[1] - y1, y43 = b[1] - y3,
        ua = (x43 * (y1 - y3) - y43 * (x1 - x3)) / (y43 * x21 - x43 * y21);
      return [x1 + ua * x21, y1 + ua * y21];
    }

    // Compute unit vector perpendicular to p01.
    private static perp(p0, p1) {
      var u01x = p0[1] - p1[1], u01y = p1[0] - p0[0],
        u01d = Math.sqrt(u01x * u01x + u01y * u01y);
      return [u01x / u01d, u01y / u01d];
    }
  }

  class WebGLTrajectories extends Trajectories {

    private gl: WebGLRenderingContext;
    private program = {id: /*WebGLProgram =*/ null, pos: -1, opacity: -1, color: /*WebGLUniformLocation =*/ null};
    private buffers = { pos: /*WebGLBuffer =*/ null, opacity : /*WebGLBuffer =*/ null };

    private static colors = {
      normal: d3.rgb('#ffffff'),
      hovered: d3.rgb('#feb24c'),
      selected: d3.rgb('#ffffff')
    };
    private static lineWidth = 1;

    private static vertexShader = "attribute vec2 pos; \
      attribute float opacity; \
      uniform vec3 color; \
      uniform mat4 projectionMatrix; \
      varying vec4 mycolor;\
      void main(void) { \
        gl_Position = projectionMatrix * vec4(pos, 0.0, 1.0); \
        mycolor = vec4(color, opacity); \
      }";

    private static fragmentShader = "precision mediump float;\
      varying vec4 mycolor;\
      void main(void) {\
        gl_FragColor = mycolor; \
      }";

    private act = { data : [], hovered : PVDModels.Node = null };

    constructor($root, config) {
      super($root, config);
      var canvas = <HTMLCanvasElement>$root.node();
      var gl = this.gl = <WebGLRenderingContext>canvas.getContext('experimental-webgl');
      gl.viewport(0,0, canvas.width, canvas.height);

      gl.clearColor(0.0, 0.0, 0.0, 0.0); //transparent

      //shader
      function compileShader(type, code: string) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          alert(gl.getShaderInfoLog(shader));
          return null;
        }
        return shader;
      }
      var vertexShader = compileShader(gl.VERTEX_SHADER, WebGLTrajectories.vertexShader);
      var fragmentShader = compileShader(gl.FRAGMENT_SHADER, WebGLTrajectories.fragmentShader);

      this.program.id = gl.createProgram();
      gl.attachShader(this.program.id, vertexShader);
      gl.attachShader(this.program.id, fragmentShader);
      gl.linkProgram(this.program.id);

      if (!gl.getProgramParameter(this.program.id, gl.LINK_STATUS)) {
        alert("Could not initialize shaders");
      }
      gl.useProgram(this.program.id);

      this.program.pos = gl.getAttribLocation(this.program.id, "pos");
      gl.enableVertexAttribArray(this.program.pos);

      this.program.opacity = gl.getAttribLocation(this.program.id, "opacity");
      gl.enableVertexAttribArray(this.program.opacity);

      this.program.color = gl.getUniformLocation(this.program.id, "color");

      //initialize buffers
      {
        this.buffers.pos = gl.createBuffer();
        this.buffers.opacity = gl.createBuffer();
      }
    }

    resize(width: number, height: number) {
      this.$root.attr({
        width: width,
        height: height
      });
      this.render();
    }

    hover(node: PVDModels.Node) {
      this.act.hovered = node;
      this.render();
    }

    show(data) {
      this.act.data = data;
      this.render();
    }

    private preRender() {
      var c = this.$root.node();
      var gl = this.gl;
      gl.viewport(0,0, c.width, c.height);

      // 2/(r-l)  0    0        -(r+l)/(r-l)
      // 0     2/(t-b) 0        -(t+b)/(t-b)
      // 0       0     -2/(f-n) (f+n)/(f-n)
      // 0       0     0        1
      var left = 0, right = c.width, top = 0, bottom = c.height, near = -1, far = 1;
      //opengl column order
      var transposed = new Float32Array([
        2/(right-left), 0, 0, 0, //
        0, 2/(top-bottom), 0, 0, //
        0, 0, -2/(far-near), 0, //
        -(right+left)/(right-left), -(top+bottom)/(top-bottom), (far+near)/(far-near), 1
      ]);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.program.id, "projectionMatrix"), false, transposed);


      var gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      //that sucks: https://code.google.com/p/chromium/issues/detail?id=60124
      gl.lineWidth(WebGLTrajectories.lineWidth);
    }

    private computeLines() {

      var data = this.act.data,
        selection = this.currentSelection,
        hovered = this.act.hovered;

      var x = this.line.x(),
        y = this.line.y();

      var r = data.map((body) => {
        var vertices = [];
        var opacities = [];
        var hovered = hovered === body.node.node;
        var selected = !hovered && selection.indexOf(body.node.node) > -1;
        var color = hovered ? WebGLTrajectories.colors.hovered : (selected ? WebGLTrajectories.colors.selected : WebGLTrajectories.colors.normal);

        //TODO spline interpolation

        this.opacity.domain([0, body.trajectory.length]);

        body.trajectory.forEach((d,i) => {
          vertices.push(x(d));
          vertices.push(y(d));
          opacities.push(this.opacity(i));
        });

        return {
          vertices: vertices,
          opacities: opacities,
          color: color
        }
      });

      return r;
    }

    private render() {
      this.preRender();
      var gl = this.gl;

      var lines = this.computeLines();
      lines.forEach((line) => {
        var vertices = line.vertices;
        var opacities = line.opacities;
        var color = line.color;
        if (vertices.length === 0) {
          return;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pos);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        gl.vertexAttribPointer(this.program.pos, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.opacity);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(opacities), gl.STATIC_DRAW);
        gl.vertexAttribPointer(this.program.opacity, 1, gl.FLOAT, false, 0, 0);

        gl.uniform3f(this.program.color, color.r / 255, color.g / 255, color.b / 255);

        gl.drawArrays(gl.LINE_STRIP, 0, vertices.length / 2);
      });
    }
  }


  angular.module('pipesVsDamsApp').directive('pvdThermalLayout', function (pvdInfrastructureLoader:PVDInfrastructureLoader, pvdWindowResize:PVDWindowResize, $timeout, pvdAnimator: PVDAnimator, pvdDataSelection: PVDDataSelection, pvdInfrastructureMapper: PVDInfrastructureMapper, pvdLayoutManager:PVDLayoutManager, pvdTargetHierarchy:PVDTargetHierarchy, pvdChangeBorder:PVDChangeBorder) {
    return  {
      controller: function ($scope) {
      },
      compile: function (element, attrs:any) {
        attrs.datatype = angular.isDefined(attrs.datatype) ? attrs.datatype : 'stream';
        attrs.sliceWidth = angular.isDefined(attrs.sliceWidth) ? +attrs.sliceWidth : 20;
        attrs.sliceHeight = angular.isDefined(attrs.sliceHeight) ? +attrs.sliceHeight : 20;
        attrs.initDirectiveOnly = (angular.isDefined(attrs.initDirectiveOnly) && attrs.initDirectiveOnly === 'true') ? true : false;
        attrs.isStandalone = (angular.isDefined(attrs.isStandalone) && attrs.isStandalone === 'true') ? true : false;

        return function ($scope, element) {
          pvdInfrastructureLoader.get(attrs.infraId).then((infrastructure:PVDModels.Infrastructure) => {
            $timeout(() => { //skip one time to ensure that the svg is properly layouted

              //var path:string = $scope.path;
              //var attr = infrastructure.findAttr(path);
              var $base = d3.select(element[0]);

              pvdDataSelection.infra = infrastructure;

              var $root:D3.Selection = $base.append('div')
                .classed('cg-thermal', true)
                .attr('data-infra-id', attrs.infraId);
                //.append('div');

              var config = new PVDHierarchyConfig(pvdAnimator, pvdDataSelection, pvdLayoutManager, pvdInfrastructureMapper, pvdTargetHierarchy, pvdChangeBorder, pvdWindowResize);
              config.datatype = attrs.datatype;
              config.autoSize = attrs.autoSize;
              config.nodeWidth = attrs.sliceWidth;
              config.sliceHeight = attrs.sliceHeight;
              //config.triggerActivity = true;

              config.gridWidth = parseInt(d3.select($root.node().parentNode).style('width'));
              config.gridHeight = window.innerHeight;

              config.visConfigId = attrs.visConfig;

              modifyConfig(config, infrastructure);

              if(attrs.initDirectiveOnly === false) {
                new PVDThermalLayout($root, infrastructure, config, attrs.isStandalone);
              }
            }, 10);
          });
        }
      },
      scope: {
        'infraId': '@?', // id of infrastructure*.json
        'datatype': '@?', // mode like 'static', 'stream' (default: 'stream')
        'sliceWidth': '@?', // slice width
        'sliceHeight': '@?', // slice height
        'visConfig': '@?', // infrastructure.visConfig[...]
        'isStandalone': '@?', // is the ThermalLayout used without the Treemap directive? (default: false)
        'initDirectiveOnly': '@?' // init only the directive or also the TypeScript class (and functionality)? (default: 'false')
      },
      restrict: 'E'
    };
  });

}

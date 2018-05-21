/**
 * Created by Holger Stitz on 15.04.2016.
 */
import * as angular from '@bower_components/angular';
import Animator, { PVDAnimator } from "./Animator";
import { nextID } from "../directives/VisUtils";
import { DOIComponent, DOIFormula } from '../models/DOI';
import DataSelection, { PVDDataSelection } from './DataSelection';
import DataService, { PVDDataService } from './DataService';

/**
 *
 */
export class PVDBroadcastService {

  private _isActive = false;

  private refids = [];

  constructor(private pvdDataSelection: PVDDataSelection, private pvdDataService: PVDDataService, private pvdAnimator: PVDAnimator) { }

  public set isActive(val) {
    this._isActive = val;

    if (val === true) {
      console.info('broadcasting is enabled');
      this.addListener();
    } else {
      console.info('broadcasting is disabled');
      this.removeListener();
    }
  }

  public get isActive() {
    return this._isActive;
  }

  private addListener() {
    var that = this;

    this.pvdDataService.on('internalMessage', (msg) => {
      if (msg.type !== 'broadcast') {
        return;
      }

      // don't execute if message was send from this view
      if (that.refids.indexOf(msg.refid) > -1) {
        that.refids.splice(that.refids.indexOf(msg.refid), 1);
        return;
      }

      console.log(msg);

      // disable broadcasting to prevent infinite message loops
      that._isActive = false;

      switch (msg.subtype) {
        case 'nodeSelection':
          {
            var nodes = msg.selection.map((fqname) => that.pvdDataSelection.infra.findNode(fqname));
            that.pvdDataSelection.addBulkSelection(nodes, true);
            break;
          }
        case 'nodeHover':
          {
            that.pvdDataSelection.hover = (msg.hover === '') ? null : that.pvdDataSelection.infra.findNode(msg.hover);
            break;
          }
        case 'hoverTime':
          {
            that.pvdDataSelection.hoverTime = msg.hoverTime;
            break;
          }
        case 'doi':
          {
            var doi = msg.doi;
            var components = doi.components.map((c) => new DOIComponent(c.attr, c.weight, c.range, c.invert));
            that.pvdDataSelection.doi = new DOIFormula(components, doi.alpha, doi.beta, doi.nsteps, doi.default_, doi.range, doi.step, doi.fuzzyDays, doi.deltaMethod, doi.loadingPercentage);
            break;
          }
        case 'indexPoint':
          {
            that.pvdDataService.loadIndexPointData(msg.indexPoint, false);
            that.pvdDataSelection.indexPoint = msg.indexPoint;
            break;
          }
        case 'timeRange':
          {
            that.pvdDataSelection.loadingOverlay(true);

            var tr = msg.timeRange;
            that.pvdDataSelection.setPinnedSelection(tr.point, tr.past, tr.future, tr.steps);
            var loadingFrom = this.pvdDataSelection.doi.getLoadingStart(tr.point - tr.past, tr.past);

            console.info("bulk load and jump [" + (new Date(tr.point - tr.past)).toUTCString() + ", " + (new Date(tr.point)).toUTCString() + "]",
              "load with doi buffer [" + (new Date(loadingFrom)).toUTCString() + ", " + (new Date(tr.point)).toUTCString() + "]");

            that.pvdDataService.bulkLoadAndJump(loadingFrom, tr.point, true, // <- autostart animator
              function () {
                that.pvdDataSelection.infra.updateDynamicRangeAttr(loadingFrom, tr.point);
                console.info('complete: bulk load and jump');
                //that.config.animator.stop();

                //that.pvdDataSelection.stopStream(function() {
                //  console.info('stopped streaming');
                //});

                /*
                  HACK FOR DATA STREAMING (aka ANIMATION) [TVCG Journal Revision]
                  set animator now and cached now to `to_t`,
                  because dataService.bulkLoadAndJump() would set animator.now to `loadingFrom`
                  which does not fit with the brush extent.
                 */
                that.pvdAnimator.now = tr.point;

                // hide loading overlay
                setTimeout(() => {
                  that.pvdDataSelection.loadingOverlay(false);
                }, 1000);
              });
            break;
          }
      }

      // activate broadcasting again
      that._isActive = true;
    });

    this.pvdDataSelection.on('selectall', (newItems, allItems, bakAllItems) => {
      var msg = that.pvdDataService.createInternalMessage('broadcast');
      msg.refid = nextID();
      msg.subtype = 'nodeSelection';
      msg.selection = allItems.map((n) => n.fqname);
      this.broadcastMessage(msg);
    });

    this.pvdDataSelection.on('hover', (node) => {
      var msg = that.pvdDataService.createInternalMessage('broadcast');
      msg.refid = nextID();
      msg.subtype = 'nodeHover';
      msg.hover = (node) ? node.fqname : '';
      this.broadcastMessage(msg);
    });

    this.pvdDataSelection.on('hoverTime', (bak, value) => {
      var msg = that.pvdDataService.createInternalMessage('broadcast');
      msg.refid = nextID();
      msg.subtype = 'hoverTime';
      msg.hoverTime = value;
      this.broadcastMessage(msg);
    });

    this.pvdDataSelection.on('doi', (bak, value) => {
      var msg = that.pvdDataService.createInternalMessage('broadcast');
      msg.refid = nextID();
      msg.subtype = 'doi';
      msg.doi = value.toPlainObject();
      this.broadcastMessage(msg);
    });

    this.pvdDataSelection.on('indexPoint', (bak, value) => {
      var msg = that.pvdDataService.createInternalMessage('broadcast');
      msg.refid = nextID();
      msg.subtype = 'indexPoint';
      msg.indexPoint = value;
      this.broadcastMessage(msg);
    });

    this.pvdDataSelection.on('change', (value, bak) => {
      var msg = that.pvdDataService.createInternalMessage('broadcast');
      msg.refid = nextID();
      msg.subtype = 'timeRange';
      msg.timeRange = value.toPlainObject();
      this.broadcastMessage(msg);
    });

  }

  private removeListener() {
    this.pvdDataService.on('internalMessage', null);
    this.pvdDataSelection.on('selectall', null);
    this.pvdDataSelection.on('hover', null);
    this.pvdDataSelection.on('hoverTime', null);
    this.pvdDataSelection.on('doi', null);
    this.pvdDataSelection.on('indexPoint', null);
    this.pvdDataSelection.on('change', null);
  }

  private broadcastMessage(msg) {
    if (this.isActive === true) {
      this.refids.push(msg.refid);
      this.pvdDataService.send(msg);
    }
  }
}

export default angular.module('services.pvdBroadcastService', [
  Animator,
  DataService,
  DataSelection
]).service('pvdBroadcastService', PVDBroadcastService).name;

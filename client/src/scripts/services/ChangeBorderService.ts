/**
 * Created by Holger Stitz on 09.01.2015.
 */
import * as angular from 'angular';
import * as d3 from 'd3';
import { nextID } from '../directives/VisUtils';
import { Node } from '../models/Infrastructure';

export class AChangeBorder {
  public marginStart = 20; // margin in the beginning for change border ruler
  public marginEnd = 20; // margin at the end for change border ruler
  public isInitialized = false;

  private _id = 'changeborder' + nextID();
  private _scale: string = 'linear';

  private _minSize = 0;
  private _maxSize = 0; // gridWidth || gridHeight in px

  // domain (input) = activity, range (output) = position in percent!
  protected _activityToPosition: d3.scale.Linear<any, any>; // can be also d3.scale.Log<any, any>

  private _color = d3.scale.linear<string, number>().domain([0, 0.5, 1]).range(['red', 'white', 'green']).clamp(true);

  private _relPosFactor = []; // factors between the each position (for updating all pos via segment)

  constructor() {
  }

  init(borderConfig: any): void {
    //console.log(borderConfig);
    this.scale = borderConfig.scale;
    this.activities = borderConfig.activities;
    this.relativePositions = borderConfig.relativePositions; // in percent
    this.calculateRelPosFactors(); // after setting relative positions
    this._color.range(borderConfig.colors || this._color.range());
    this.marginStart = borderConfig.marginStart || this.marginStart;
    this.marginStart *= ApplicationConfiguration.zoomFactor;
    this.marginEnd = borderConfig.marginEnd || this.marginEnd;
  }

  get maxSize(): number {
    return this._maxSize;
  }

  set maxSize(value: number) {
    this._maxSize = value;
  }

  get minSize(): number {
    return this._minSize;
  }

  set minSize(value: number) {
    this._minSize = value;
  }

  get id(): string {
    return this._id;
  }

  get scale(): string {
    return this._scale;
  }

  set scale(value: string) {
    this._scale = value;
  }

  get d3scaleAbsPos(): d3.scale.Linear<any, any> {
    var scale = this._activityToPosition.copy();
    scale.range(this.absPositions);
    return scale;
  }

  get activities(): number[] {
    return this._activityToPosition.domain();
  }

  set activities(value: number[]) {
    this._activityToPosition.domain(value);
    var extent = d3.extent(value);
    extent.splice(1, 0, this.centerAct);
    this._color.domain(extent); // update color scale with [min, center, max]
  }

  getColorLegend() {
    var domain = this._color.domain();
    var range = this._color.range();
    var g = '';
    if (range.length == 2) {
      g = range.join(',');
    } else {
      g = range.map((r, i) => i === 0 || i === range.length - 1 ? r : r + ' ' + d3.round(i * 100 / (range.length - 1), 0) + '%').join(',');
    }
    return {
      left: domain[0],
      gradient: 'linear-gradient(to top, ' + g + ')',
      right: domain[domain.length - 1]
    }
  }

  get centerAct(): number {
    return d3.max(this.activities) - (d3.max(this.activities) - d3.min(this.activities)) / 2;
  }

  get relativePositions(): number[] {
    return this._activityToPosition.range();
  }

  set relativePositions(value: number[]) {
    this._activityToPosition.range(value);
  }

  get absPositions(): number[] {
    return this.mappedPositions();
  }

  mappedPositions(size: number[] = [this.minSize, this.maxSize], padding: number[] = [0, 0]): number[] {
    return this.relativePositions.map((relPos) => this.toAbsPos(relPos, size, padding));
  }

  centerAbsPos(): number {
    return this.actToPos(this.centerAct);
  }

  centerRange(): number[] {
    var left = d3.bisectLeft(this.activities, this.centerAct),
      right = d3.bisectRight(this.activities, this.centerAct);

    // e.g. centerAct = 0.5 and activities = [..., 0.4, 0.6, ...]
    if (left === right) {
      left -= 1;

      // e.g. centerAct = 0.5 and activities = [..., 0.5, 0.5, ...]
    } else {
      right -= 1;
    }

    return [
      this.toAbsPos(this.relativePositions[left]),
      this.toAbsPos(this.relativePositions[right])
    ];
  }

  /**
   * Convert activity to an absolute position
   * @param activity
   * @param size = [min, max]
   * @param padding = [start, end]
   * @returns {number}
   */
  actToPos(activity: number, size: number[] = [this.minSize, this.maxSize], padding: number[] = [0, 0]): number {
    return this.toAbsPos(this._activityToPosition(activity), size, padding);
  }

  /**
   * Convert absolute position to activity value
   * @param absPosition
   * @param size = [min, max]
   * @param padding = [start, end]
   * @returns {number}
   */
  posToAct(absPosition: number, size: number[] = [this.minSize, this.maxSize], padding: number[] = [0, 0]): number {
    return this._activityToPosition.invert(this.toRelPos(absPosition, size, padding));
  }

  actToColor(activity?: number): number {
    activity = activity || this.centerAct;
    return this._color(activity);
  }

  segmentByPos(absPosition): number {
    var relPos = this.toRelPos(absPosition),
      posPairs = d3.pairs(this.relativePositions);

    for (var i = 0, n = posPairs.length; i < n; i++) {
      if (d3.min(posPairs[i]) <= relPos && relPos <= d3.max(posPairs[i])) {
        return i;
      }
    }

    return NaN;
  }

  actRangeBySegment(segment): number[] {
    var posPairs = d3.pairs(this.activities);
    return posPairs[segment];
  }

  posRangeBySegment(segment): number[] {
    var posPairs = d3.pairs(this.absPositions);
    return posPairs[segment];
  }

  updateActivityByAbsPos(index, absPos) {
    this.activities[index] = this.posToAct(absPos);
    this.activities = this.activities; // re-set to trigger d3.scale.rescale()
  }

  updateRelPosByAbsPos(index, absPos) {
    this.relativePositions[index] = this.toRelPos(absPos);
    this.relativePositions = this.relativePositions; // re-set to trigger d3.scale.rescale()
  }

  calculateRelPosFactors() {
    for (var i = 0, n = this.relativePositions.length; i < n; i++) {
      this._relPosFactor[i] = [];
      this.relativePositions.forEach((pos, k) => {
        this._relPosFactor[i][k] = [
          // left border
          (this.relativePositions[k] / this.relativePositions[i]),
          // right border
          (1 - this.relativePositions[k]) / (1 - this.relativePositions[i])
        ];
      });
    }
  }

  updateAllPos(delta: number, segment: string) {
    var first = 0,
      last = this.relativePositions.length - 1,
      left = +segment, // convert to number
      right = +segment + 1, // convert to number
      isLeftAttached = (delta < 0 && this.relativePositions[left] <= this.relativePositions[first]), // left attached to first
      isRightAttached = (delta > 0 && this.relativePositions[right] >= this.relativePositions[last]); // right attached to last

    var relPos = this.relativePositions.map((pos, i) => {
      // excluding first and last
      if (i <= first || i >= last) {
        return pos;

      } else if (isLeftAttached) {
        return (i <= left) ? this.relativePositions[first] : pos;

      } else if (isRightAttached) {
        return (i >= right) ? this.relativePositions[last] : pos;
      }

      if (i === left || i === right) {
        pos = this.toRelPos(this.toAbsPos(pos) + delta);

        isLeftAttached = (i === left && pos <= this.relativePositions[first]);
        isRightAttached = (i === right && pos >= this.relativePositions[last]);

      } else if (i < left) {
        pos = this.toRelPos(this._relPosFactor[left][i][0] * this.absPositions[left]);

      } else if (i > right) {
        pos = this.toRelPos(this.maxSize - ((this.maxSize - this.absPositions[right]) * this._relPosFactor[right][i][1]));
      }

      if (pos <= this.relativePositions[first]) {
        pos = this.relativePositions[first];
      } else if (pos >= this.relativePositions[last]) {
        pos = this.relativePositions[last];
      }

      return pos;
    });

    this.relativePositions = relPos;
  }

  /**
   * Converts absolute to relative position
   * @param absPosition
   * @param size = [min, max]
   * @param padding = [start, end]
   * @returns {number}
   */
  protected toRelPos(absPosition, size: number[] = [this.minSize, this.maxSize], padding: number[] = [0, 0]) {
    return (absPosition - (size[0] + padding[0])) / ((size[1] - padding[1]) - (size[0] + padding[0]));
  }

  /**
   * Converts relative to absolute position
   * @param relPosition
   * @param size = [min, max]
   * @param padding = [start, end]
   * @returns {number}
   */
  protected toAbsPos(relPosition, size: number[] = [this.minSize, this.maxSize], padding: number[] = [0, 0]) {
    return (relPosition * ((size[1] - padding[1]) - (size[0] + padding[0]))) + (size[0] + padding[0]);
  }

  static hasNegAndPos(values: number[]) {
    return (d3.min(values) < 0 && d3.max(values) > 0);
  }

  static closestNumber(num: number, arr: number[]): number {
    var curr = arr[0];
    var diff = Math.abs(num - curr);
    for (var val = 0; val < arr.length; val++) {
      var newdiff = Math.abs(num - arr[val]);
      if (newdiff < diff) {
        diff = newdiff;
        curr = arr[val];
      }
    }
    return curr;
  }
}

class LinearChangeBorder extends AChangeBorder {
  constructor() {
    super();
    this._activityToPosition = d3.scale.linear().clamp(true);
  }
}

class LogChangeBorder extends AChangeBorder {
  private _negativeScale = d3.scale.log().clamp(true);
  private _positiveScale = d3.scale.log().clamp(true);
  private _halfPosition = 0;
  private _limesZero = 0.000001;

  constructor() {
    super();
    this._activityToPosition = d3.scale.log().clamp(true);
  }

  private insertInMiddle(values, middle, insert, invertInsert = false) {
    var isNeg = (values[0] < middle);

    values.forEach((v, i) => {
      if (isNeg !== (v < middle)) {
        if (invertInsert) {
          if (v < middle) {
            values.splice(i, 0, insert, -insert);
          } else {
            values.splice(i, 0, -insert, insert);
          }

        } else {
          values.splice(i, 0, insert);
        }
      }
      isNeg = (v < middle);
    });
  }

  get activities(): number[] {
    return this._activityToPosition.domain();
  }

  set activities(value: number[]) {
    this._activityToPosition.domain(value);

    if (AChangeBorder.hasNegAndPos(value)) {
      this.insertInMiddle(value, 0, this._limesZero, true);
      //console.log(value);

      var neg = value.filter((v) => { return v < 0; });
      //console.log('neg', neg);
      this._negativeScale.domain(neg);

      var pos = value.filter((v) => { return v > 0; });
      //console.log('pos', pos);
      this._positiveScale.domain(pos);
    }
  }

  get relativePositions(): number[] {
    return this._activityToPosition.range();
  }

  set relativePositions(value: number[]) {
    this._activityToPosition.range(value);

    if (AChangeBorder.hasNegAndPos(this.activities)) {
      this._halfPosition = ((d3.max(value) - d3.min(value)) / 2) + d3.min(value);
      this.insertInMiddle(value, this._halfPosition, this._halfPosition, false);

      var indexOfMiddle = value.indexOf(this._halfPosition),
        negHalf = [],
        posHalf = [];

      // negative values left from middle
      if (this.activities.indexOf(this._negativeScale.domain()[0]) === 0) {
        negHalf = value.slice(0, indexOfMiddle + 1);
        posHalf = value.slice(indexOfMiddle, value.length);

        // negative values right from middle
      } else {
        negHalf = value.slice(indexOfMiddle, value.length);
        posHalf = value.slice(0, indexOfMiddle + 1);
      }

      //console.log('neg', negHalf);
      //console.log('pos', posHalf);
      this._negativeScale.range(negHalf);
      this._positiveScale.range(posHalf);
    }
  }

  /**
   * Convert activity to an absolute position
   * @param activity
   * @returns {number}
   */
  actToPos(activity: number): number {
    if (AChangeBorder.hasNegAndPos(this.activities)) {
      if (activity === 0) {
        return this.toAbsPos(this._halfPosition);

      } else if (activity < 0) {
        return this.toAbsPos(this._negativeScale(activity));

      } else if (activity > 0) {
        return this.toAbsPos(this._positiveScale(activity));

      }

    } else {
      return super.actToPos(activity);
    }
  }

  /**
   * Convert absolute position to activity value
   * @param absPosition
   * @returns {number}
   */
  posToAct(absPosition: number): number {
    if (AChangeBorder.hasNegAndPos(this.activities)) {
      var relPosition = this.toRelPos(absPosition);
      if (relPosition === this._halfPosition) {
        return 0;

      } else if (relPosition < this._halfPosition) {
        return this._negativeScale.invert(relPosition);

      } else if (relPosition > this._halfPosition) {
        return this._positiveScale.invert(relPosition);

      }

    } else {
      return super.posToAct(absPosition);
    }
  }

}


export class SegmentRepresentation {

  public hSegment: string = '*';
  public vSegment: string = '*';

  private _visConfigId: string = '';
  private _hideIn: string[] = [];

  private _behavior: any = {};
  private _appliedBehavior: string = null;

  constructor() {
    // nothing
  }

  init(repConfig: any) {
    this.hSegment = repConfig.hSeg || this.hSegment;
    this.vSegment = repConfig.vSeg || this.vSegment;
    this.visConfigId = repConfig.visConfigId || this.visConfigId;
    this.hideIn = repConfig.hideIn || this.hideIn;
    this._behavior = repConfig.behavior || this._behavior;
  }

  match(hSeg, vSeg): boolean {
    /*console.log(parseInt(this.hSegment), parseInt(this.vSegment), hSeg, vSeg,
      (this.hSegment == '*' && this.vSegment == '*'),
      (hSeg == '*' && vSeg == '*'),
      (this.hSegment == '*' && parseInt(this.vSegment) == vSeg),
      (parseInt(this.hSegment) == hSeg && this.vSegment == '*'),
      (parseInt(this.hSegment) == hSeg && parseInt(this.vSegment) == vSeg)
    );*/

    return (
      (this.hSegment == '*' && this.vSegment == '*') ||
      (hSeg == '*' && vSeg == '*') ||
      (this.hSegment == '*' && parseInt(this.vSegment) == vSeg) ||
      (parseInt(this.hSegment) == hSeg && this.vSegment == '*') ||
      (parseInt(this.hSegment) == hSeg && parseInt(this.vSegment) == vSeg)
    );
  }

  isHidden(directiveName): boolean {
    return (this.hideIn.indexOf(directiveName) > -1);
  }

  applyBehavior(id: string) {
    if (this._behavior[id] === undefined || this._appliedBehavior !== null) { return; }
    this._appliedBehavior = id;
  }

  removeBehavior(id: string) {
    if (this._behavior[id] === undefined || this._appliedBehavior !== id) { return; }
    this._appliedBehavior = null;
  }

  get origVisConfigId() {
    return this._visConfigId;
  }

  get visConfigId() {
    if (this._behavior[this._appliedBehavior]) {
      return this._behavior[this._appliedBehavior].visConfigId || this._visConfigId;
    }
    return this._visConfigId;
  }

  set visConfigId(value: any) {
    this._visConfigId = value;
  }

  get hideIn() {
    if (this._behavior[this._appliedBehavior]) {
      return this._behavior[this._appliedBehavior].hideIn || this._hideIn;
    }
    return this._hideIn;
  }

  set hideIn(value: any) {
    this._hideIn = value;
  }

}

export class PVDChangeBorder {

  /*
    crossed = body crossed a border
    segrep = if the config of a segement representation is updated
    req_layout_coord = request layout coordinates from semantic perspectives
    rep_layout_coord = reply with layout coordinates to thermal layout
   */
  private listeners = d3.dispatch('crossed', 'segrep', 'req_layout_coord', 'rep_layout_coord', 'dragstart', 'drag', 'dragend', 'maxsize');

  public vertical: AChangeBorder;
  public horizontal: AChangeBorder;

  private segmentRep: SegmentRepresentation[] = [];

  on(type: string, listener?) {
    if (arguments.length < 2)
      return this.listeners.on(type);
    this.listeners.on(type, listener);
    return this;
  }

  private fire(type: string, ...args: any[]) {
    //console.debug('fired event "' + type + '" with', args);
    this.listeners[type].apply(this, args);
  }

  crossed(node: Node, newSegRep: SegmentRepresentation, oldSegRep: SegmentRepresentation = null) {
    this.fire('crossed', node, newSegRep, oldSegRep);
  }

  propagateMaxSize() {
    this.fire('maxsize');
  }

  updateSegmentRep(newSegRep) {
    this.fire('segrep', newSegRep);
  }

  requestLayoutCoordinates(infra, isFirstCall) {
    this.fire('req_layout_coord', infra, isFirstCall);
  }

  replyLayoutCoordinates(infra, isFirstCall, nodesMap, domElOffset) {
    this.fire('rep_layout_coord', infra, isFirstCall, nodesMap, domElOffset);
  }

  dragStart(border, orientation) {
    this.fire('dragstart', border, orientation);
  }

  drag(border, orientation) {
    this.fire('drag', border, orientation);
  }

  dragEnd(border, orientation) {
    this.fire('dragend', border, orientation);
  }

  initChangeBorder(orientation: string, borderConfig: any) {
    switch (borderConfig.scale) {
      case 'log':
        this[orientation] = new LogChangeBorder();
        break;

      case 'linear':
      default:
        this[orientation] = new LinearChangeBorder();
        break;
    }
    this[orientation].init(borderConfig);
  }

  addSegmentRep(repConfig: any) {
    var rep = new SegmentRepresentation();
    rep.init(repConfig);
    this.segmentRep.push(rep);
  }

  getSegmentRepByVisConfigId(visConfigId: string): SegmentRepresentation {
    for (var i = 0, n = this.segmentRep.length; i < n; i++) {
      if (this.segmentRep[i].origVisConfigId === visConfigId) { // matches first appearance
        return this.segmentRep[i];
      }
    }

    console.warn('No segment representation matched -> use', this.segmentRep[0].visConfigId);
    return this.segmentRep[0];
  }

  getSegmentRepById(hSeg: string = '*', vSeg: string = '*'): SegmentRepresentation {
    for (var i = 0, n = this.segmentRep.length; i < n; i++) {
      if (this.segmentRep[i].match(hSeg, vSeg)) {
        return this.segmentRep[i];
      }
    }

    console.warn('No segment representation matched -> use', this.segmentRep[0].visConfigId);
    return this.segmentRep[0];
  }

  segmentRepByPos(absPosX, absPosY, isSelected = false) {
    if (isSelected) {
      return this.segmentRep[this.segmentRep.length - 1];
    }
    if (absPosX < 0 || absPosY < 0) {
      //console.warn('Use first segment representation for (x = ' + absPosX + ', y = ' + absPosY + ')');
      return this.segmentRep[0];
    }

    var vSeg = this.vertical.segmentByPos(absPosX),
      hSeg = this.horizontal.segmentByPos(absPosY);

    if (isNaN(vSeg) || isNaN(hSeg)) {
      //console.warn('No segment representation for (x = ' + absPosX + ', y = ' + absPosY + ') -> use ', this.segmentRep[0].visConfigId);
      console.warn('No segment representation -> use', this.segmentRep[0].visConfigId);
      return this.segmentRep[0];
    }

    for (var i = 0, n = this.segmentRep.length; i < n; i++) {
      if (this.segmentRep[i].match(hSeg, vSeg)) {
        return this.segmentRep[i];
      }
    }

    //console.warn('No segment representation matched for (x = ' + absPosX + ', y = ' + absPosY + ') -> use ', this.segmentRep[0].visConfigId);
    console.warn('No segment representation matched -> use', this.segmentRep[0].visConfigId);
    return this.segmentRep[0];
  }

}

export default angular.module('services.pvdDataGenerator', [])
  .service('pvdChangeBorder', [
    PVDChangeBorder
  ]).name;

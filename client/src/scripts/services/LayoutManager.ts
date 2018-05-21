import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import { Infrastructure } from "../models/Infrastructure";
import { PVDGridLayout } from '../directives/layouts/GridLayout';
import { PVDNodeLinkLayout, PVDIciclePlotLayout, PVDAbacusLayout } from '../directives/layouts/NodeLinkLayouts';
import { PVDForceLayout } from '../directives/layouts/ForceLayout';
import { IPVDLayout } from '../directives/layouts/Layout';

/**
 * Created by Holger Stitz on 09.09.2014.
 */

export class PVDHierarchyLayoutConfig {

  // vast dataset
  public sortBy: string = 'alphabet'; // alphabet || activity
  public autoShrink: boolean = false;
  public active: boolean = false;

  // thermal layout
  public showPhysicsBodies: boolean = false;
  public showTrajectories: boolean = false;
  public bodyCollisionDetection: boolean = false;
  public deltaTime = '10'; // in [s]
  public physicsOptions = {
    edgeCollision: {
      restitution: '0.99',
      friction: '1.0'
    },
    bodies: {
      mass: '1.0',
      restitution: '1.0',
      friction: '0.8'
    }
  };

  constructor(public infra: Infrastructure,
    public layoutId: string) {
  }
}

export class PVDLayoutManager {
  private listeners = d3.dispatch('initialized', 'layout', 'nodes');

  // access from AngularJS
  public layouts: any[] = [];
  public configs: PVDHierarchyLayoutConfig[] = [];

  private layoutsMap: d3.Map<any> = d3.map();
  private configsMap: d3.Map<PVDHierarchyLayoutConfig> = d3.map();

  private _infrastructures: Infrastructure[] = [];

  constructor() {
    // add new layouts here and in createSelectedLayout()
    this.reset();
  }

  reset() {
    this.layouts = [];
    this.layoutsMap = d3.map();
    this.configs = [];
    this.configsMap = d3.map();
    this._infrastructures = [];

    this.layouts.push(PVDAbacusLayout);
    this.layouts.push(PVDGridLayout);
    this.layouts.push(PVDNodeLinkLayout);
    this.layouts.push(PVDIciclePlotLayout);
    this.layouts.push(PVDForceLayout);

    this.layouts.forEach((d) => {
      this.layoutsMap.set(d.ID, d);
    });
  }

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

  addInfrastructure(infra: Infrastructure) {
    if (infra === null) { return; }

    this._infrastructures.push(infra);

    // special case for vm
    //if(infra.id === 'vm') {
    //  this._createLayoutConfig(infra, PVDNodeLinkLayout.ID);
    //} else {
    this._createLayoutConfig(infra, PVDGridLayout.ID);
    //}
  }

  set infrastructures(infras: Infrastructure[]) {
    this._infrastructures = infras;
  }

  get infrastructures(): Infrastructure[] {
    return this._infrastructures;
  }

  private _createLayoutConfig(infra, layoutId) {
    var c = new PVDHierarchyLayoutConfig(infra, layoutId);
    this.configs.push(c);
    this.configsMap.set(infra.id, c);
  }

  getLayoutConfig(hierarchyId: string): PVDHierarchyLayoutConfig {
    return this.configsMap.get(hierarchyId);
  }

  // if you don't care about a specific layout config, use the first one
  getFirstLayoutConfig(): PVDHierarchyLayoutConfig {
    if (this.configs.length === 0) {
      return null;
    }
    return this.configsMap.get(this.configs[0].infra.id);
  }

  /**
   * Creates a new instance of the selected layout
   * @returns {PVDVisualizations.IPVDHierarchyLayout}
   */
  getLayoutByHierarchyId(hierarchyId: string): IPVDLayout {
    var selectedConfig = this.configsMap.get(hierarchyId);

    if (selectedConfig === undefined) {
      return null;
    } else {
      return this.getLayoutById(selectedConfig.layoutId);
    }
  }

  getLayoutById(layoutId: string): IPVDLayout {
    var type: any = this.layoutsMap.get(layoutId);
    return new type();
  }

  updateNodes(layoutConfig) {
    this.fire('nodes', layoutConfig);
  }

  updateLayout(layoutConfig: PVDHierarchyLayoutConfig) {
    this.fire('layout', layoutConfig);
  }

  initialized() {
    this.fire('initialized');
  }
}

export default angular.module('services.pvdLayoutManager', []).service('pvdLayoutManager', PVDLayoutManager).name;

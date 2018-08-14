/**
 * Created by Holger Stitz on 13.04.2016.
 */

export class ApplicationConfiguration {

  /**
   * Increase the zoom factor for displays that are > 4K
   * @returns {number}
   */
  public static get zoomFactor() {
    return (window.innerWidth >= 3 * 1920) ? 2 : 1;
  }
}

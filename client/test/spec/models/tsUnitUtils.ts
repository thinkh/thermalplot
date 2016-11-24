/**
 * Created by AK113797 on 17.04.2014.
 */
/// <reference path="tsUnit.ts" />

function sameArrays<T>(t : tsUnit.TestClass, a : T[], b: T[]) : void {
    t.isTruthy(b);
    t.areIdentical(a.length, b.length);
    for (var i = 0; i < a.length; ++i) {
        if (a[i] !== undefined && a[i] !== null) {
            t.areIdentical(a[i], b[i]);
        } else {
            t.isFalsey(b[i]);
        }
    }
}
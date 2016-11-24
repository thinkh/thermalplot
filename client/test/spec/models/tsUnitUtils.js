function sameArrays(t, a, b) {
    t.isTruthy(b);
    t.areIdentical(a.length, b.length);
    for (var i = 0; i < a.length; ++i) {
        if (a[i] !== undefined && a[i] !== null) {
            t.areIdentical(a[i], b[i]);
        }
        else {
            t.isFalsey(b[i]);
        }
    }
}
//# sourceMappingURL=tsUnitUtils.js.map
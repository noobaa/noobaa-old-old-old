'use strict';
var map_func = function() {
    if (this.event !== 'welcome.load' || this.user) {
        return;
    }
    var date = this._id.getTimestamp();
    var month = date.getFullYear() + '-' + (date.getMonth() + 1);
    var key = {
        month: month
    };
    emit({
        month: month
    }, 1);
    emit({
        month: month,
        ip: this.req.ip
    }, 1);
};
var reduce_func = function(key, values) {
    if (key.ip) {
        return 1;
    } else {
        return Array.sum(values);
    }
};
var months = {};
db.trackevents.mapReduce(map_func, reduce_func, {
    out: {
        inline: 1
    }
}).results.forEach(function(res) {
    var key = res._id;
    var m = months[key.month] = months[key.month] || {};
    if (key.ip) {
        m.uniq = (m.uniq || 0) + 1;
    } else {
        m.total = res.value;
    }
});
for (var k in months) {
    print(k, 'total', months[k].total, 'uniq', months[k].uniq);
}

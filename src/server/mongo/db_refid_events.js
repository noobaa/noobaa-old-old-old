'use strict';
var prev_refid;
db.trackevents.find({
    'data.refid': {
        $exists: 1
    },
    'user.name': {
        $ne: 'Guy Margalit'
    }
}).sort({
    'data.refid': 1
}).forEach(function(e) {
    var user = e.user ? e.user.name : e.req.ip;
    var data = e.data || {};
    var refid = data.refid;
    if (refid !== prev_refid) {
        print('===', refid, '===');
        prev_refid = refid;
    }
    print(e.time, '-', e.event, ' [' + user + ']');
});

'use strict';

var events_per_utm_id = {};
db.trackevents.aggregate([{
    $group: {
        _id: {
            event: "$event",
            utm_id: "$data.utm_id"
        },
        count: {
            $sum: 1
        }
    }
}]).result.forEach(function(e) {
	var utm_id = e._id.utm_id;
	var event = e._id.event;
    var events = events_per_utm_id[utm_id];
    if (!events) {
        events = events_per_utm_id[utm_id] = {};
    }
    events[event] = (events[event] || 0) + e.count;
	if (!utm_id) {
		print('no utm', event, e.count);
	}
});

print('\n');
print('utm_id, e.utm_source, e.utm_medium, e.utm_term, e.utm_campaign, e.utm_content');
db.utmmodels.find().sort({
    _id: 1
}).forEach(function(e) {
	var utm_id = e._id.valueOf();
    print(utm_id, e.utm_source, e.utm_medium, e.utm_term, e.utm_campaign, e.utm_content);
    var events = events_per_utm_id[utm_id];
    for (var event in events) {
        print('\t', event, events[event]);
    }
});

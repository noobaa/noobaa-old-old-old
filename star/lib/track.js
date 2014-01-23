/* jshint node:true */
'use strict';

// grab the Mixpanel factory
// create an instance of the mixpanel client
// var Mixpanel = require('mixpanel');
// var mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN);

function tracking_pixel(event_name, disinct_id) {
	var data = {
		"event": event_name,
		"properties": {
			"token": process.env.MIXPANEL_TOKEN,
			"distinct_id": disinct_id,
		}
	};
	var data_buf = new Buffer(JSON.stringify(data));
	var pixel_url = 'http://api.mixpanel.com/track/?data=' + data_buf.toString('base64') + '&ip=1&img=1';
	return pixel_url;
}

exports.tracking_pixel = tracking_pixel;

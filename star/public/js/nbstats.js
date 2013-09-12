/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
$(function() {
	'use strict';

	$('body').on('click.nbstats', 'a, button, [ng-click]', function(event) {
		var info;
		var elem = event.target;
		if (elem.id) {
			info = elem.id;
		// } else if (elem.className) {
			// info = elem.className;
		} else if (elem.outerText) {
			info = elem.outerText;
		} else {
			info = elem;
		}
		console.log('NBSTATS', info, event);
	});
});
/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */

(function(global) {
	'use strict';

	function log(msg) {
		console.log(msg);
		$('#log').append('<p><i class="label">' + msg + '</i></p>');
	}

	var store = new global.Store(100 * 1024 * 1024 * 1024);

	store.onerror = function(err) {
		console.error(err);
		$('#log').append('<p style="color: red">' + err + '</p>');
	};

	store.onload = function(fs) {
		log('FS inited');
		store.query_usage();
	};

	store.onusage = function(usage, quota) {
		log('Usage: ' + usage + ' Quota: ' + quota);
	};

}(this)); // passing global this to allow exporting
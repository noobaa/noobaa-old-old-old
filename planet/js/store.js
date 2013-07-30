/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */

(function(global) {
	'use strict';

	function Store(bytes) {
		this.Storage = navigator.webkitPersistentStorage;
		this.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
		this.requestFileSystem = this.requestFileSystem.bind(null, window.PERSISTENT);
		this.fs = null;
		var me = this;
		this.Storage.requestQuota(bytes,
			function(granted_bytes) {
				console.log(granted_bytes, bytes);
				if (granted_bytes < bytes) {
					me.onerror('could not get quota ' + granted_bytes);
					return;
				}
				me.requestFileSystem(granted_bytes,
					function(fs) {
						me.fs = fs;
						me.onload();
					}, function(err) {
						me.onerror(err);
					}
				);
			}, function(err) {
				me.onerror(err);
			}
		);
	}

	Store.prototype.query_usage = function() {
		return this.Storage.queryUsageAndQuota(this.onusage, this.onerror);
	};

	// override
	Store.prototype.onload = function() {};

	// override
	Store.prototype.onerror = function(err) {
		console.error(err);
	};

	// override
	Store.prototype.onusage = function(usage, quota) {
		console.log('Usage:', usage, 'Quota:', quota);
	};

	global.Store = Store;

}(this)); // passing global this to allow exporting
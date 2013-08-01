/* jshint node:true, browser:true, jquery:true, devel:true */
/* global angular:false */

// script initializer
(function() {
	'use strict';

	// declare our module with dependancy on the angular-ui module
	var noobaa_app = angular.module('noobaa_app', [ /*'ui'*/ ]);
})();

// the dashboard angular controller

function DashboardCtrl($scope) {
	'use strict';

	console.log('DashboardCtrl');

	$scope.home_location = window.location.href;
	$scope.reload_home = function() {
		window.console.log(window.location, $scope.home_location);
		window.location.href = $scope.home_location;
		//gui.Window.get().reload();
	};

	// load native ui library
	var gui = $scope.gui = window.require('nw.gui');

	// make window hide on close
	gui.Window.get().on('close', function() {
		this.hide();
	});

	$scope.open = function() {
		var w = gui.Window.get();
		w.show();
		w.restore();
		w.focus();
		w.requestAttention(true);
	};

	$scope.new_win = function(url) {
		var w = gui.Window.open(url, {
			toolbar: false,
			frame: false,
			icon: "nblib/img/noobaa_icon.ico",
			width: 750,
			height: 550
		});
		/*
		console.log(w);
		w.on('loaded', function() {
			var ngui = w.window.require('nw.gui');
			var menu = new ngui.Menu();
			// {type: 'menubar'});
			var item = new ngui.MenuItem({
				submenu: new ngui.Menu()
			});
			menu.append(item);
			item.submenu.append(new ngui.MenuItem({
				label: '(Show Dev Tools)',
				click: function() {
					w.showDevTools();
				}
			}));
			console.log(w.window);
			w.window.document.body.addEventListener('contextmenu', function(ev) {
				console.log(ev);
				ev.preventDefault();
				menu.popup(ev.x, ev.y);
				return false;
			});
		});
		*/
	};

	$scope.quit = function() {
		var q = 'Closing the application will stop the co-sharing. Are you sure?';
		if (window.confirm(q)) {
			gui.App.quit();
		}
	};

	if (!process.mainModule.exports.tray) {
		// create tray icon
		var tray = process.mainModule.exports.tray = new gui.Tray({
			title: 'NooBaa',
			tooltip: 'Click to open NooBaa\'s Dashboard...',
			icon: 'nblib/img/noobaa_icon.ico',
			menu: new gui.Menu()
		});
		tray.on('click', $scope.open);

		// create tray menu
		var m = tray.menu;
		m.append(new gui.MenuItem({
			label: 'NooBaa\'s Dashboard',
			click: $scope.open
		}));
		m.append(new gui.MenuItem({
			label: 'Launch NooBaa website',
			click: function() {
				gui.Shell.openExternal('https://www.noobaa.com');
			}
		}));
		m.append(new gui.MenuItem({
			type: 'separator'
		}));
		// TODO: show only for development
		m.append(new gui.MenuItem({
			label: '(Show Dev Tools)',
			click: function() {
				gui.Window.get().showDevTools();
			}
		}));
		m.append(new gui.MenuItem({
			label: '(Reload)',
			click: $scope.reload_home
		}));
		m.append(new gui.MenuItem({
			type: 'separator'
		}));
		m.append(new gui.MenuItem({
			label: 'Quit NooBaa',
			click: $scope.quit
		}));
	}

	// after all is inited, open the window
	$scope.open();
}

// avoid minification effects by injecting the required angularjs dependencies
DashboardCtrl.$inject = ['$scope'];


$(function() {
	'use strict';

	var util = require('util');
	var fs = require('fs');
	var _ = require('underscore');

	function show_log() {
		var args = _.map(arguments, function(x) {
			return util.inspect(x);
		});
		console.log.apply(console, args);
		$('#log').append('<p>' + args.join(' ') + '</p>');
	}

	function show_error() {
		var args = _.map(arguments, function(x) {
			return util.inspect(x);
		});
		console.error.apply(console, args);
		$('#log').append('<p style="color: red">' +
			args.join(' ') + '</p>');
	}

	function zerobuf(len) {
		var buf = new ArrayBuffer(len);
		var view = new Uint8Array(buf);
		for (var i = 0; i < len; i++) {
			view[i] = 0;
		}
		return buf;
	}

	var FSSIZE = 10 * 1024 * 1024;
	var ZEROBLOB = new Blob([zerobuf(1024 * 1024)]);


	// Planet filesystem class

	function PlanetFS(fs, fssize) {
		this.fs = fs;
		this.fssize = fssize;
	}

	// async init of PlanetFS object and run the given planet_fs_main(pfs)

	function init_PlanetFS(fssize, planet_fs_main) {
		return requestFileSystem(
			window.PERSISTENT,
			fssize,
			function(fs) {
				var f = new PlanetFS(fs, fssize);
				planet_fs_main(f);
			}, function(err) {
				show_error('PlanetFS_init:', err);
				// TODO: throw?
			}
		);
	}

	// create one more chunk file on the fs to consume the space

	PlanetFS.prototype.create_chunk = function(callback) {
		var me = this;
		var time = new Date().getTime();
		var fname = 'chunk-' + time + '.noobaa';
		return async.waterfall([
			// create the file
			function(next) {
				show_log('PlanetFS', 'create_chunk:', fname);
				return me.fs.root.getFile(fname, {
					create: true,
					exclusive: true
				}, function(fileEntry) {
					return next(null, fileEntry);
				}, function(err) {
					return next(err);
				});
			},
			// open for write
			function(fileEntry, next) {
				show_log('PlanetFS', 'create_chunk:', 'open for write...');
				return fileEntry.createWriter(function(writer) {
					return next(null, writer);
				}, function(err) {
					return next(err);
				});
			},
			// write buffer (zeros)
			function(writer, next) {
				show_log('PlanetFS', 'create_chunk:', 'writing...');
				writer.onwriteend = function() {
					return next();
				};
				writer.onerror = function(err) {
					return next(err);
				};
				return writer.write(ZEROBLOB);
			}
		], callback);
	};


	// create more chunks to consume all the unused space

	PlanetFS.prototype.create_chunks_for_unused = function(callback) {
		var me = this;
		return async.waterfall([
			function(next) {
				show_log('PlanetFS', 'create_chunks_for_unused:', 'query usage...');
				return storage.queryUsageAndQuota(function(usage, quota) {
					show_log('PlanetFS', 'Quota - usage:' + usage + ' quota:' + quota);
					return next(null, usage);
				}, function(err) {
					return next(err);
				});
			},
			function(usage, next) {
				var unused = me.fssize - usage;
				show_log('PlanetFS', 'create_chunks_for_unused:', 'unused=', unused);
				return async.whilst(
					function() {
						unused -= 1024 * 1024;
						return unused > 0;
					}, function(next_while) {
						return me.create_chunk(next_while);
					}, next);
			}
		], callback);
	};


	PlanetFS.prototype.foreach_chunk = function(iterator, callback) {
		show_log('PlanetFS', 'foreach_chunk', 'start');
		var reader = this.fs.root.createReader();
		var readdir = function() {
			// call the reader.readEntries() until no more results are returned
			return reader.readEntries(function(results) {
				if (!results.length) {
					// readdir done
					show_log('PlanetFS', 'foreach_chunk', 'done');
					return callback();
				}
				var entries = _.toArray(results);
				return async.every(entries, iterator, function(err) {
					if (err) {
						return callback(err);
					} else {
						// continue to next read
						return readdir();
					}
				});
			}, function(err) {
				return callback(err);
			});
		};
		return readdir(); // start the readdir
	};

	function show_entry(entry, callback) {
		show_log('PlanetFS', 'show_entry:', entry);
		return callback();
	}

	function delete_entry(entry, callback) {
		entry.remove(function() {
			show_log('PlanetFS', 'delete_entry:', entry);
			return callback();
		}, function(err) {
			return callback(err);
		});
	}

	/*
	init_PlanetFS(FSSIZE, function(pfs) {
		return async.waterfall([
			pfs.foreach_chunk.bind(pfs, show_entry),
			pfs.foreach_chunk.bind(pfs, delete_entry),
			pfs.create_chunks_for_unused.bind(pfs)
		], function(err) {
			if (err) {
				show_error(err);
			} else {
				show_log('PlanetFS:', 'all done.');
			}
		});
	});
	*/

});
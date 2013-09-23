/* jshint node:true, browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
(function() {
	'use strict';

	// keep local refs here so that any callback functions
	// defined here will resolve to the window.* members
	// and avoid failures when console is null on fast refresh.
	var console = window.console;
	var localStorage = window.localStorage;
	var os = require('os');
	var path = require('path');
	var http = require('http');
	// load native node-webkit library
	var gui = window.require('nw.gui');
	// get the node-webkit native window of the planet
	var win = gui.Window.get();


	// define the planet angular controller

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.controller('PlanetCtrl', [
		'$scope', '$http', '$timeout', 'nbUploadSrv',
		PlanetCtrl
	]);

	function PlanetCtrl($scope, $http, $timeout, nbUploadSrv) {
		console.log('PlanetCtrl');

		// set the scope in the window to signal to the planet_boot code
		// that we are loaded and it can communicate with our scope.
		win.$scope = $scope;

		// keep original location as home location
		// to be able to restore to it if we redirect
		$scope.home_location = window.location.href;

		$scope.stop = function() {
			srv_stop();
		};

		$scope.hide_win = function() {
			win.hide();
		};

		$scope.show = function() {
			// using always on top to popup the window
			win.setAlwaysOnTop(true);
			win.show();
			win.restore();
			win.blur();
			win.focus();
			// win.requestAttention(true);
		};

		// dont really be always on top,
		// when the focus is dropped, remove it
		win.on('blur', function() {
			win.setAlwaysOnTop(false);
		});

		// make window hide on close
		win.on('close', $scope.hide_win);
		$scope.close_win = function() {
			win.close(true); // force close, since close only hides
		};

		$scope.open_noobaa = function(path) {
			// using the same host and protocol as the local window
			// to support also testing env.
			var url = window.location.protocol + '//' +
				window.location.host + (path || '/');
			gui.Shell.openExternal(url);
		};

		$scope.open_settings = function() {
			$scope.open_noobaa('/settings');
		};

		$scope.open_help = function() {
			$scope.open_noobaa('/help');
		};

		$scope.nbconfirm = function(q, callback) {
			$scope.show();
			$.nbconfirm(q, {
				on_confirm: callback,
				css: {
					width: win.width - win_frame_width,
					height: win.height - win_frame_height,
					top: 0,
					left: 0
				}
			});
		};

		// terminate the entire application
		$scope.quit_app = function() {
			var q = 'Quitting will stop co-sharing, ' +
				'which will affect your account quota and performance.<br/>' +
				'Click "No" to keep co-sharing:';
			$scope.nbconfirm(q, function() {
				gui.App.quit();
			});
		};

		// on load show the window.
		// TODO: this might be too annoying if triggered by auto update
		// or even some crashing bug, so maybe only when the user requested...
		$scope.show();

		// pass "secret" argument to open dev tools
		if (gui.App.argv.length && gui.App.argv[0] === '--noobaadev') {
			win.showDevTools();
		}

		// since our window has a frame and win.width/height include it
		// then we need to consider it
		var win_inner_width = 500;
		var win_inner_height = 400;
		var win_inner_height_long = 500;
		var win_frame_width = win.width - win_inner_width;
		var win_frame_height = win.height - win_inner_height;



		////////////////////////////////////////////////////////////
		// local http server to open the app window

		$scope.srv_port_preferred = 0;
		$scope.srv_port = 0;

		function srv_start() {
			if (!$scope.srv) {
				$scope.srv = http.createServer(function(req, res) {
					res.writeHead(200, {
						'Content-Type': 'text/plain',
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Headers': 'X-Requested-With'
					});
					if (req.method === 'OPTIONS') {
						res.end();
						return;
					}
					res.end('NBOK\n');
					$scope.show();
					// $('#file_upload_input').trigger('click');
					$scope.safe_apply();
				});
				$scope.srv.on('error', function(err) {
					if (err.code == 'EADDRINUSE') {
						console.log('Address in use, retrying...');
						setTimeout(srv_start, 1000);
					} else {
						console.log('SRV ERROR', err);
					}
				});
			}
			srv_stop();
			$scope.srv.listen($scope.srv_port_preferred, function() {
				$scope.srv_port = $scope.srv.address().port;
				console.log('SRV listening on port', $scope.srv_port);
				$scope.safe_apply();
			});
			$scope.safe_apply();
		}

		function srv_stop() {
			if ($scope.srv_port) {
				$scope.srv.close();
				$scope.srv_port = 0;
			}
		}
		srv_start();


		////////////////////////////////////////////////////////////


		// init the planet authentication.
		// user login state
		$scope.planet_loading = false;
		$scope.planet_user = null;

		// update the connect frame src to load a new url
		// the frame is used to contain the facebook connect code
		// which cannot be used inside a 'file://' type url 
		// which is used by node-webkit.
		$scope.auth_frame_path = function(path) {
			$('#auth_frame')[0].src = path;
			$scope.planet_loading = true;
			$scope.safe_apply();
		};

		// pull info from the frame once it loads
		$('#auth_frame')[0].onload = function() {
			var f = window.frames.auth_frame;
			// when the user login returned info, pull it to our state
			console.log('USER:', f.noobaa_user);
			$scope.planet_loading = false;
			$scope.planet_user = f.noobaa_user;
			schedule_device(1);
			get_user_folders();
			$scope.safe_apply();
		};

		// submit connect request - will open facebool login dialog window.
		$scope.do_connect = function() {
			if (!window.frames.auth_frame.FB) {
				$scope.auth_frame_path('/auth/logout/?state=/planet/auth');
				return;
			}
			window.frames.auth_frame.FB.login(function(res) {
				if (res.authResponse) {
					$scope.auth_frame_path('/auth/facebook/login/?state=/planet/auth');
				}
			});
		};

		// logout - mostly for testing
		$scope.do_logout = function() {
			var q = 'Logging out will stop co-sharing, ' +
				'which will affect your account quota and performance.<br/>' +
				'Click "No" to keep co-sharing:';
			$scope.nbconfirm(q, function() {
				$scope.auth_frame_path('/auth/logout/?state=/planet/auth');
			});
		};

		// on init load the auth login page into the frame.
		$scope.auth_frame_path('/planet/auth');


		////////////////////////////////////////////////////////////


		// init the planet fs
		// this will create chunk files in the app directory
		// and make them available for co-sharing.
		$scope.planetfs = new global.PlanetFS(
			gui.App.dataPath.toString(), // root_dir
			1, // num_chunks
			1024 * 1024 // chunk_size
		);
		$scope.planetfs.init_chunks(function(err) {
			if (err) {
				console.log('PLANET FS INIT FAILED:', err.toString());
			} else {
				console.log('PLANET FS INIT DONE');
			}
		});


		////////////////////////////////////////////////////////////


		// if (localStorage.planet_device) {
		//	$scope.planet_device = JSON.parse(localStorage.planet_device);
		// }

		function close_if_reload_requested(data) {
			if (data && data.reload) {
				console.log('RELOAD REQUESTED');
				return $scope.close_win();
			}
		}

		function reconnect_device() {
			delete $scope.planet_device;
			delete localStorage.planet_device;
			schedule_device(1000);
		}

		function save_device_info(data) {
			if (data && data.device) {
				$scope.planet_device = data.device;
				localStorage.planet_device = JSON.stringify(data.device);
			}
		}

		function schedule_device(time) {
			$timeout.cancel($scope.device_promise);
			$scope.device_promise = $timeout(periodic_device, time);
		}

		function periodic_device() {
			if (!$scope.planet_user) {
				// no user connected, reschedule to check later
				schedule_device(10000);
			} else if (!$scope.planet_device) {
				// no device id - ask to create
				create_device();
			} else {
				update_device();
			}
		}

		function create_device() {
			return $http({
				method: 'POST',
				url: '/star_api/device/',
				data: {
					host_info: get_host_info(),
					srv_port: $scope.srv_port
				}
			}).success(function(data, status, headers, config) {
				console.log('[ok] create device', status);
				close_if_reload_requested(data);
				save_device_info(data);
				schedule_device(5000);
			}).error(function(data, status, headers, config) {
				console.error('[ERR] create device', data, status);
				close_if_reload_requested(data);
				schedule_device(5000);
			});
		}

		function update_device(coshare_space) {
			return $http({
				method: 'PUT',
				url: '/star_api/device/' + $scope.planet_device._id,
				data: {
					host_info: get_host_info(),
					srv_port: $scope.srv_port,
					coshare_space: coshare_space
				}
			}).success(function(data, status, headers, config) {
				console.log('[ok] update device', status);
				close_if_reload_requested(data);
				if (coshare_space) {
					save_device_info(data);
				}
				schedule_device(60000);
			}).error(function(data, status, headers, config) {
				console.error('[ERR] update device', data, status);
				reconnect_device();
				close_if_reload_requested(data);
			});
		}

		function get_host_info() {
			return {
				hostname: os.hostname(),
				platform: os.platform()
			};
		}

		periodic_device();

		var GB = 1024 * 1024 * 1024;
		$scope.coshare_options = [{
			space: 10 * GB,
			title: '10GB',
		}, {
			space: 100 * GB,
			title: '100GB',
		}];

		$scope.coshare_selection = -1;

		$scope.coshare_options_select = function(index) {
			$scope.coshare_selection = index;
		};

		$scope.apply_coshare = function() {
			var index = $scope.coshare_selection;
			var opt = $scope.coshare_options[index];
			update_device(opt.space);
			$scope.coshare_view(false);
		};

		$scope.coshare_options_class = function(index) {
			return index === $scope.coshare_selection ? 'btn-primary' : 'btn-default';
		};

		$scope.coshare_view = function(val) {
			if ($scope.planet_loading || !$scope.planet_user) {
				return;
			}
			$scope.coshare_selection = -1;
			$scope.coshare_view_on = val;
			if (val) {
				if (win.height < win_inner_height_long + win_frame_height) {
					win.resizeBy(0, win_inner_height_long + win_frame_height - win.height);
				}
			} else {
				if (win.height > win_inner_height + win_frame_height) {
					win.resizeBy(0, win_inner_height + win_frame_height - win.height);
				}
			}
		};

		$scope.current_view = function() {
			if ($scope.planet_loading) {
				return 'loading_view';
			}
			if (!$scope.planet_user) {
				return 'login_view';
			}
			if ($scope.coshare_view_on) {
				return 'coshare_view';
			}
			return 'info_view';
		};

		function get_user_folders() {
			if (!$scope.planet_user) {
				return;
			}
			return $http({
				method: 'GET',
				url: '/star_api/inode/null'
			}).then(function(res) {
				console.log('GOT USER FOLDERS', res);
				for (var i = 0; i < res.data.entries.length; i++) {
					var ent = res.data.entries[i];
					if (ent.name === 'My Data') {
						$scope.planet_user.mydata = ent;
					}
				}
				return res;
			}, function(err) {
				console.error('FAILED GET USER FOLDERS', err);
				$timeout(get_user_folders, 1000); // retry later
				throw err;
			});
		}

		$scope.has_uploads = function() {
			return nbUploadSrv.has_uploads();
		};

		nbUploadSrv.init_drop($(document));
		nbUploadSrv.init_file_input($('#file_upload_input'));
		nbUploadSrv.init_file_input($('#dir_upload_input'));
		nbUploadSrv.get_dir_inode_id = function(event) {
			if (!$scope.planet_user || !$scope.planet_user.mydata) {
				return false;
			}
			return $scope.planet_user.mydata.id;
		};
		nbUploadSrv.on_file_upload = function(upload) {
			// save last upload path for next open
			$scope.last_file_path = upload.file && upload.file.path || '';
			return nbUploadSrv.upload_file(upload);
		};

		$scope.click_upload = function() {
			gui.Shell.showItemInFolder($scope.last_file_path);
		};

	}

})();
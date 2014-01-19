/* jshint node:true, browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.factory('nbPlanet', [
		'$http', '$timeout', '$rootScope', 'nbUser', 'nbUploadSrv',
		function($http, $timeout, $rootScope, nbUser, nbUploadSrv) {
			// keep local refs here so that any callback functions
			// defined here will resolve to the window.* members
			// and avoid failures when console is null on fast refresh.
			var console = window.console;
			var localStorage = window.localStorage;

			if (!window.require) {
				console.log('nbPlanet NO REQUIRE');
				return {};
			}

			console.log('nbPlanet REQUIRE');

			var $scope = {
				on: true
			};

			var os = require('os');
			var path = require('path');
			var fs = require('fs');
			var http = require('http');
			var child_process = require('child_process');
			// load native node-webkit library
			var gui = window.require('nw.gui');
			// get the node-webkit native window of the planet
			var win = gui.Window.get();

			// set the scope in the window to signal to the planet_boot code
			// that we are loaded and it can communicate with our scope.
			win.$scope = $scope;

			// keep original location as home location
			// to be able to restore to it if we redirect
			$scope.home_location = window.location.href;

			$scope.stop = function() {
				srv_stop();
				gui.App.removeListener('open', $scope.on_open_cmd);
			};

			$scope.hide_win = function() {
				win.hide();
			};


			function show_window(w) {
				// using always on top to popup the window
				// w.setAlwaysOnTop(true);
				w.show();
				w.restore();
				w.blur();
				w.focus();
				// w.requestAttention(true);
			}

			$scope.show = function() {
				show_window(win);
			};

			// dont really be always on top,
			// when the focus is dropped, remove it
			win.on('blur', function() {
				// win.setAlwaysOnTop(false);
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
					// css: {
					//	width: win.width - win_frame_width,
					//	height: win.height - win_frame_height,
					//	top: 0,
					//	left: 0
					// }
				});
			};

			// terminate the entire application
			$scope.quit_app = function() {
				var q = 'Quitting will stop co-sharing.<br/>' +
					'This will affect your account quota and performance.<br/>' +
					'Click "No" to keep co-sharing:';
				$scope.nbconfirm(q, function() {
					gui.App.quit();
				});
			};

			// Listen to open event
			$scope.on_open_cmd = function(cmd) {
				var up = cmd.match(/upload\s+(.*)/);
				console.log('APP OPEN', cmd, 'UPLOAD', up);
				if (!up) {
					return;
				}
				var file_path = up[1].trim();
				// on windows the path comes quoted, and we strip the quotes
				// so that the fs module will be able to work with it.
				var quoted = file_path.match(/\"(.*)\"/);
				if (quoted) {
					file_path = quoted[1];
				}
				console.log('UPLOAD PATH', file_path);
				// prepare pseudo event with the path information
				// and pass to upload service
				var event = {
					preventDefault: function() {},
					stopPropagation: function() {},
					dataTransfer: {
						files: [{
							path: file_path,
							name: path.basename(file_path)
						}]
					}
				};
				event.originalEvent = event;
				nbUploadSrv.submit_upload(event);
				$scope.show();
				$rootScope.safe_apply();
			};

			gui.App.on('open', $scope.on_open_cmd);


			// on load show the window.
			// TODO: this might be too annoying if triggered by auto update
			// or even some crashing bug, so maybe only when the user requested...
			$scope.show();

			// pass "secret" argument to open dev tools
			if (gui.App.argv.length && gui.App.argv[0] === '--noobaadev') {
				win.showDevTools();
			}


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
						$rootScope.safe_apply();
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
					$rootScope.safe_apply();
				});
				$rootScope.safe_apply();
			}

			function srv_stop() {
				if ($scope.srv_port) {
					$scope.srv.close();
					$scope.srv_port = 0;
				}
			}
			srv_start();


			////////////////////////////////////////////////////////////
			/*

			// init the planet authentication.
			// user login state
			$scope.planet_loading = false;
			$scope.planet_user = null;

			var auth_frame = $('#auth_frame')[0];
			var auth_frame_window = window.frames.auth_frame.window;

			// update the connect frame src to load a new url
			// the hidden frame is used to maintain the login/logout state
			// this could also be done with ajax, but in order to reuse 
			// the existing login/logout paths it was a bit shorter with a frame.
			$scope.auth_frame_path = function(path) {
				auth_frame.src = path;
				$scope.planet_loading = true;
				$rootScope.safe_apply();
			};

			// pull info from the frame once it loads
			auth_frame.onload = function() {
				// when the user login returned info, pull it to our state
				console.log('USER:', auth_frame_window.noobaa_user, auth_frame, auth_frame_window);
				$scope.planet_loading = false;
				$scope.planet_user = auth_frame_window.noobaa_user;
				schedule_device(1);
				get_user_folders();
				$rootScope.safe_apply();
			};

			var login_window;

			// submit connect request - will open facebook/google login dialog window.
			$scope.do_connect = function(provider) {
				// if the window exists, just show it
				if (login_window) {
					show_window(login_window);
					return;
				}
				// create the login window according to the provider
				var login_path = '/auth/' + provider + '/login/?state=/planet/auth';
				var login_url = window.location.protocol + '//' + window.location.host + login_path;
				login_window = gui.Window.open(login_url, {
					toolbar: false,
					frame: true,
					focus: true,
					position: 'center',
				});
				// set event handler to nullify the window variable once closed
				// which will allow to open it again if canceled, or later on.
				login_window.on('closed', function() {
					login_window = null;
				});
				login_window.on('loaded', function() {
					// after the window loads new content refresh the user in the auth frame
					// it might be right after successful login, but might also occur on bad password etc.
					// in any case we refresh the frame which is the decision point about login success.
					$scope.auth_frame_path('/planet/auth');
					// auto close window on successful login
					if (this.window.frames && this.window.frames.noobaa_user) {
						login_window.close();
					}
				});
			};

			// logout - mostly for testing
			$scope.do_logout = function() {
				var q = 'Logging out will stop co-sharing.<br/>' +
					'which will affect your account quota and performance.<br/>' +
					'Click "No" to keep co-sharing:';
				$scope.nbconfirm(q, function() {
					$scope.auth_frame_path('/auth/logout/?state=/planet/auth');
				});
			};

			// on init load the auth login page into the frame.
			$scope.auth_frame_path('/planet/auth');
*/

			////////////////////////////////////////////////////////////


			// init the planet fs
			// this will create chunk files in the app directory
			// and make them available for co-sharing.
			/*
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
*/


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
					var space = $scope.planet_device.coshare_space;
					for (var i = 0; i < $scope.coshare_options.length; i++) {
						if (space === $scope.coshare_options[i].space) {
							$scope.coshare_selection = i;
							break;
						}
					}
				}
			}

			function schedule_device(time) {
				$timeout.cancel($scope.device_promise);
				$scope.device_promise = $timeout(periodic_device, time);
			}

			function periodic_device() {
				if (!nbUser.user) {
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
					url: '/api/device/',
					data: {
						host_info: get_host_info(),
						srv_port: $scope.srv_port
					}
				}).then(function(res) {
					console.log('[ok] create device', res);
					close_if_reload_requested(res.data);
					save_device_info(res.data);
				}).then(function() {
					if (!$scope.loaded_source_dev) {
						console.log('RELOAD SOURCE DEVICE', $scope.planet_device);
						return nbUploadSrv.reload_source($scope.planet_device._id).then(function() {
							$scope.loaded_source_dev = true;
						});
					}
				}).then(function() {
					schedule_device(5000);
				}, function(err) {
					console.error('[ERR] create device', err);
					close_if_reload_requested();
					schedule_device(5000);
				});
			}

			function update_device(coshare_space) {
				return $http({
					method: 'PUT',
					url: '/api/device/' + $scope.planet_device._id,
					data: {
						host_info: get_host_info(),
						srv_port: $scope.srv_port,
						coshare_space: coshare_space
					}
				}).then(function(res) {
					console.log('[ok] update device', res);
					close_if_reload_requested(res.data);
					if (coshare_space) {
						save_device_info(res.data);
					}
					schedule_device(60000);
				}, function(err) {
					console.error('[ERR] update device', err);
					reconnect_device();
					close_if_reload_requested();
				});
			}

			function get_host_info() {
				return {
					hostname: os.hostname(),
					platform: os.platform()
				};
			}

			$scope.get_source_device_id = function() {
				return $scope.planet_device ? $scope.planet_device._id : undefined;
			};

			periodic_device();

			var GB = 1024 * 1024 * 1024;
			$scope.coshare_options = [{
				space: 10 * GB,
				title: '10 GB',
			}, {
				space: 100 * GB,
				title: '100 GB',
			}, {
				space: 200 * GB,
				title: '200 GB',
			}];

			$scope.coshare_selection = -1;

			$scope.coshare_options_class = function(index) {
				return index === $scope.coshare_selection ? 'btn-primary' : 'btn-link';
			};

			$scope.select_coshare_option = function(index) {
				var opt = $scope.coshare_options[index];
				update_device(opt.space);
			};


			function detect_media_player() {
				var player_path;
				switch (os.platform()) {
					case 'darwin':
						player_path = '/Applications/VLC.app/Contents/MacOS/VLC';
						break;
					case 'win32':
						var PF_86 = 'ProgramFiles(x86)';
						var PF_DEFAULT = 'ProgramFiles';
						var PF = process.env[PF_86] || process.env[PF_DEFAULT];
						player_path = path.join(PF, 'VideoLAN', 'VLC', 'vlc.exe');
						break;
					default:
						player_path = path.join('/', 'usr', 'bin', 'vlc');
						break;
				}
				try {
					fs.statSync(player_path);
					$scope.media_player_path = player_path;
				} catch (e) {
					console.error('NO MEDIA PLAYER AT ', player_path, e);
				}
			}
			detect_media_player();


			$scope.open_content = function(inode) {
				console.log('PLANET OPEN CONTENT', inode);
				if ($scope.media_player_path &&
					(inode.content_kind === 'video' || inode.content_kind === 'audio')) {
					return $http({
						method: 'GET',
						url: '/api/inode/' + inode.id + '?getattr=1'
					}).then(function(res) {
						console.log('PLANET OPEN CONTENT GET ATTR', res);
						child_process.spawn($scope.media_player_path, [
							res.data.s3_get_url,
							'--no-video-title-show'
						]);
					}, function(err) {
						console.error('FAILED PLANET OPEN CONTENT GET ATTR', err);
					});
				}
			};

			return $scope;
		}
	]);

})();

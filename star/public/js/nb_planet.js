/* jshint node:true, browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.factory('nbPlanet', [
		'$http', '$timeout', '$interval', '$rootScope', '$q', 'nbUtil', 'nbUser', 'nbUploadSrv',
		function($http, $timeout, $interval, $rootScope, $q, nbUtil, nbUser, nbUploadSrv) {
			// keep local refs here so that any callback functions
			// defined here will resolve to the window.* members
			// and avoid failures when console is null on fast refresh.
			var console = window.console;
			var localStorage = window.localStorage;

			if (!window.require) {
				// console.log('nbPlanet NO REQUIRE');
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
				$interval.cancel($scope.update_drives_info_interval);
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
				nbUtil.track_event('planet.quit');
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
						srv_port: $scope.srv_port,
						drives_info: $scope.drives_info
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
						coshare_space: coshare_space,
						drives_info: $scope.drives_info
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
			}, {
				space: 400 * GB,
				title: '400 GB',
			}];

			$scope.coshare_selection = -1;

			$scope.coshare_options_class = function(index) {
				return index === $scope.coshare_selection ? 'btn-primary' : 'btn-link';
			};

			$scope.select_coshare_option = function(index) {
				var opt = $scope.coshare_options[index];
				update_device(opt.space).then(function() {
					return nbUser.update_user_info();
				}).then(function() {
					console.log('USER SPACE UPDATED');
				});
				nbUtil.track_event('planet.space.update', {
					space: opt.space
				});
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

			function array_buffer_to_buffer(ab) {
				var buffer = new Buffer(ab.byteLength);
				var view = new Uint8Array(ab);
				for (var i = 0; i < buffer.length; ++i) {
					buffer[i] = view[i];
				}
				return buffer;
			}

			$scope.open_content = function(inode) {
				console.log('PLANET OPEN CONTENT', inode);
				if ($scope.media_player_path &&
					(inode.content_kind === 'video' || inode.content_kind === 'audio')) {
					// find subtitles in sibling
					if (inode.parent) {
						var last_dot = inode.name.lastIndexOf('.');
						var base_name = last_dot < 0 ? inode.name : inode.name.substring(0, last_dot);
						var srt_name = base_name + '.srt';
						var sub_name = base_name + '.sub';
						var entries = inode.parent.entries;
						var sub_id;
						for (var i = 0; i < entries.length; i++) {
							var ent = entries[i];
							if (ent.size > 0 && ent.size <= 1048576 &&
								(ent.name === srt_name || ent.name === sub_name)) {
								console.log('FOUND SUBTITLE FILE', ent);
								sub_id = ent.id;
								break;
							}
						}
					}
					var file_url;
					var local_sub_file;
					return $http({
						method: 'GET',
						url: '/api/inode/' + inode.id + '?getattr=1'
					}).then(function(res) {
						console.log('PLANET OPEN CONTENT GET ATTR', res);
						file_url = res.data.s3_get_url;
						if (sub_id) {
							return $http({
								method: 'GET',
								url: '/api/inode/' + sub_id,
								responseType: 'arraybuffer'
							}).then(function(res) {
								console.log('GOT SUBTITLES', res);
								var deferred = $q.defer();
								local_sub_file = 'noobaa_subs.srt';
								var buf = array_buffer_to_buffer(res.data);
								fs.writeFile(local_sub_file, buf, function(err) {
									if (err) {
										console.error('FAILED SAVE SUBTITLES', err);
										local_sub_file = '';
										deferred.reject(err);
									} else {
										console.log('SAVED SUBTITLES');
										deferred.resolve();
									}
								});
								return deferred.promise;
							});
						}
					}).then(function(res) {
						var args = [file_url, '--no-video-title-show'];
						if (local_sub_file) {
							args.push('--sub-file');
							args.push(local_sub_file);
						}
						console.log('RUN PLAYER', $scope.media_player_path, args);
						child_process.spawn($scope.media_player_path, args);
						nbUtil.track_event('planet.media_player.run', {
							name: inode.name,
							subs: !! local_sub_file
						});
					}, function(err) {
						console.error('FAILED PLANET OPEN CONTENT GET ATTR', err);
					});
				}
			};

			/*
			function reset_notify_win() {
				var win;
				if ($scope.notify_win) {
					win = $scope.notify_win;
					$scope.notify_win = null;
					win.close(true);
				}
				win = gui.Window.open('planet_notify.html', {
					show: false,
					toolbar: false,
					resizable: false,
					frame: false,
					'always-on-top': true,
					width: 200,
					height: 200,
					position: 'center'
				});
				win.x = win.y = 20;
				var d = win.document;
				d.write('<h1>HAHA</h1>');
				win.show();
				$scope.notify_win = win;
			}
			reset_notify_win();
			*/


			$scope.drives_info = {};

			function set_drives_info_callback(key) {
				return function(err, info) {
					if (err) {
						console.error('FAILED TO SET DRIVES INFO', key, err);
						return;
					}
					$scope.drives_info[key] = {
						info: info,
						time: new Date()
					};
				};
			}

			function stream_read_full(stream, parser, callback) {
				// parser is optional, default parser will convert buffer to string
				if (!callback) {
					callback = parser;
					parser = function(buffer) {
						return buffer.toString();
					};
				}
				var was_called = false;
				var callback_once = function() {
					if (was_called || !callback) {
						return;
					}
					was_called = true;
					return callback.apply(null, arguments);
				};
				var buffers = [];
				stream.on('error', callback_once);
				stream.on('data', function(buffer) {
					buffers.push(buffer);
				});
				stream.on('end', function() {
					var full_buf = Buffer.concat(buffers);
					return callback_once(null, parser(full_buf));
				});
				stream.on('close', function() {
					return callback_once(null);
				});
			}

			function execute_os(exe, args, parser, callback) {
				var ps = child_process.spawn(exe, args);
				stream_read_full(ps.stdout, parser, callback);
				return ps;
			}

			var WINDOWS = {};
			(function() {
				if (os.platform() === 'win32') {
					try {
						WINDOWS.SYS32 = process.env.SYSTEM ||
							process.env.SYSTEM32 ||
							path.join(process.env.windir || process.env.WINDIR || process.env.SystemRoot || '', 'system32');
						WINDOWS.CMD = path.join(WINDOWS.SYS32, 'cmd.exe');
						WINDOWS.FSUTIL = path.join(WINDOWS.SYS32, 'fsutil.exe');
					} catch (err) {
						console.error('FAILED TO INIT WINDOWS PLATFORM');
					}
				}
			})();

			function wmic_parse_list(buffer) {
				var text = buffer.toString();
				// split by double eol - 
				// we get two \r between the \n, so we tolerate any whitespace
				var list = text.trim().split(/\s*\n\s*\n\s*/); 
				for (var i = 0; i < list.length; i++) {
					var item = list[i].trim();
					if (!item) continue;
					var lines = item.split('\n');
					var item_obj = {};
					for (var j = 0; j < lines.length; j++) {
						var line = lines[j].trim();
						if (!line) continue;
						var index = line.indexOf('=');
						if (index < 0) continue;
						var key = line.slice(0, index).trim();
						var val = line.slice(index + 1).trim();
						item_obj[key] = val;
					}
					list[i] = item_obj;
				}
				return list;
			}

			function wmic_get_list(topic, callback) {
				execute_os(WINDOWS.CMD, ['/c', 'wmic', topic, 'get', '/value'], wmic_parse_list, callback);
			}

			function wmic_save_info(topic) {
				wmic_get_list(topic, set_drives_info_callback('win_wmic_' + topic));
			}

			function table_parse(text) {
				var rows = text.trim().split('\n');
				for (var i = 0; i < rows.length; i++) {
					rows[i] = rows[i].trim().split(/\s+/);
				}
				return rows;
			}

			function update_drives_info() {
				try {
					if (os.platform() === 'win32') {
						execute_os(WINDOWS.CMD, ['/c', 'dir', 'c:'],
							set_drives_info_callback('win_dir_c'));
						wmic_save_info('diskdrive');
						wmic_save_info('logicaldisk');
						wmic_save_info('volume');
						wmic_save_info('csproduct');
						wmic_save_info('computersystem');
						wmic_save_info('os');
						wmic_save_info('cpu');
						/*
							execute_os(WINDOWS.FSUTIL, ['fsinfo', 'drives'],
								set_drives_info_callback('win_fsinfo_drives'));
							execute_os(WINDOWS.FSUTIL, ['volume', 'diskfree', 'c:'],
								set_drives_info_callback('win_fsinfo_diskfree_c'));
							*/
					} else {
						execute_os('/bin/df', ['-k'],
							set_drives_info_callback('df'));
					}
				} catch (err) {
					console.error('FAILED UPDATE DRIVES INFO', err);
				}
			}

			update_drives_info();
			$scope.update_drives_info_interval = $interval(update_drives_info, 3600000);



			////////////////////////////////////////////////////////////
			// NBFS
			////////////////////////////////////////////////////////////


			var app_root = gui.App.dataPath.toString();
			var nbfs = $scope.nbfs = {};
			nbfs.root_path = path.join(app_root, '.nbfs'); // TODO need to allow changing
			nbfs.chunks_dir = '.chunks';
			nbfs.num_chunks = 10;
			nbfs.chunk_size = 1024 * 1024;
			nbfs.zero_chunk = new Buffer(nbfs.chunk_size);
			nbfs.zero_chunk.fill(0);

			init_nbfs_chunks();

			// create chunk files in the app directory for co-sharing

			function init_nbfs_chunks(callback) {
				var chunks_path = path.join(nbfs.root_path, nbfs.chunks_dir);
				console.log('NBFS INIT CHUNKS', chunks_path);
				return async.waterfall([

					function(next) {
						return mkdirP(chunks_path, function(err) {
							return next(err);
						});
					},

					// read the dir content
					fs.readdir.bind(null, chunks_path),

					// delete each chunk with index above needed
					function(files, next) {
						console.log('NBFS readdir', files);
						if (!files || !files.length) {
							return next();
						}
						return async.every(files, function(name, next) {
							var index = parseInt(name, 10);
							var fname = path.join(chunks_path, index.toString());
							if (index < nbfs.num_chunks) {
								return next();
							}
							console.log('NBFS leaving unneeded chunk:', fname, 'TODO remove');
							return next();
							// return fs.unlink(fname, next);
						}, next);
					},

					function(next) {
						return async.times(nbfs.num_chunks, function(n, next) {
							var fname = path.join(chunks_path, n.toString());
							fs.stat(fname, function(err, stat) {
								if (!err) {
									if (stat.isFile() && stat.size === nbfs.chunk_size) {
										console.log('NBFS chunk exists', fname);
										return next();
									}
									console.log('NBFS recreate chunk with bad type/size', fname, stats);
									return fs.writeFile(fname, nbfs.zero_chunk, next);
								} else if (err.code === 'ENOENT') {
									console.log('NBFS create chunk', fname);
									return fs.writeFile(fname, nbfs.zero_chunk, next);
								} else {
									return next(err);
								}
							});
						}, next);
					}

				], function(err) {
					if (err) {
						console.error('FAILED NBFS INIT CHUNKS', err);
					}
					if (callback) {
						return callback(err);
					}
				});
			}

			function mkdirP(p, mode, f, made) {
				if (typeof mode === 'function' || mode === undefined) {
					f = mode;
					mode = parseInt('0777', 8) & (~process.umask());
				}
				if (!made) made = null;
				var cb = f || function() {};
				if (typeof mode === 'string') mode = parseInt(mode, 8);
				p = path.resolve(p);

				return fs.mkdir(p, mode, function(er) {
					if (!er) {
						made = made || p;
						return cb(null, made);
					}
					if (er.code === 'ENOENT') {
						return mkdirP(path.dirname(p), mode, function(er, made) {
							if (er) cb(er, made);
							else mkdirP(p, mode, cb, made);
						});
					}
					// In the case of any other error, just see if there's a dir
					// there already.  If so, then hooray!  If not, then something
					// is borked.
					return fs.stat(p, function(er2, stat) {
						// if the stat fails, then that's super weird.
						// let the original error be the failure reason.
						if (er2 || !stat.isDirectory()) cb(er, made);
						else cb(null, made);
					});
				});
			}

			return $scope;
		}
	]);

})();

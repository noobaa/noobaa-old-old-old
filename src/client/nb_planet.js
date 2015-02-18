'use strict';

var nb_util = angular.module('nb_util');

nb_util.factory('nbPlanet', [
    '$http', '$timeout', '$interval', '$rootScope', '$q', 'nbUtil', 'nbUser', 'nbUploadSrv',
    function($http, $timeout, $interval, $rootScope, $q, nbUtil, nbUser, nbUploadSrv) {

        // keep local refs here so that any callback functions
        // defined here will resolve to the window.* members
        // and avoid failures when console is null on fast refresh.
        var console = window.console;
        var localStorage = window.localStorage;

        var $scope = {};
        if (window.require_node) {
            console.log('nbPlanet on', $scope);
            $scope.on = true;
        } else {
            console.log('nbPlanet off');
            return $scope;
        }

        // avoid require of native nw modules.
        // these were required in bootstrap stage to avoid
        // conflicts with browserify's require
        var fs = window.require_node('fs');
        var os = window.require_node('os');
        var path = window.require_node('path');
        var http = window.require_node('http');
        var child_process = window.require_node('child_process');
        // load native node-webkit library
        var gui = window.require_node('nw.gui');

        // requires resolved from browserify's bundle
        var async = require('async');


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

        $scope.planet_confirm = function(q, callback) {
            $scope.show();
            alertify.confirm(q, callback);
        };

        // terminate the entire application
        $scope.quit_app = function() {
            nbUtil.track_event('planet.quit');
            var q = 'Quitting will stop co-sharing.<br/>' +
                'This will affect your account quota and performance.<br/>' +
                'Click "No" to keep co-sharing:';
            $scope.planet_confirm(q, function(e) {
                if (!e) return;
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
        // note to self:
        //      this might be too annoying if triggered by auto update
        //      or even some crashing bug, so maybe only when the user requested...
        // reply from future self:
        //      yes - it is annoying. made silent.
        // $scope.show();


        // dev mode to open dev tools
        var dev_mode = (gui.App.argv.indexOf('--noobaadev') >= 0);
        if (dev_mode) {
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
                    if (err.code === 'EADDRINUSE') {
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


        var last_full_heartbeat = 0;

        $scope.host_info = {
            hostname: os.hostname(),
            platform: os.platform()
        };

        $scope.get_source_device_id = function() {
            return $scope.device_id;
        };

        function close_if_reload_requested(data) {
            if (data && data.reload) {
                console.log('RELOAD REQUESTED');
                return $scope.close_win();
            }
        }

        function schedule_device() {
            $timeout.cancel($scope.device_promise);
            $scope.device_promise = $timeout(device_heartbeat, $scope.hearbeat_delay);
        }

        function device_heartbeat(coshare_space) {
            var data;
            var now = Date.now();
            if (now < last_full_heartbeat + 3600000) {
                data = {};
            } else {
                data = {
                    host_info: $scope.host_info,
                    srv_port: $scope.srv_port,
                    drives_info: $scope.drives_info,
                };
            }
            if (coshare_space) {
                data.coshare_space = coshare_space;
            }
            return $http({
                method: 'POST',
                url: '/device_api/',
                data: data
            }).then(function(res) {
                console.log('device heartbeat', res.data);
                if (res.data) {
                    close_if_reload_requested(res.data);
                    $scope.device_id = res.data.device_id;
                    $scope.hearbeat_delay = res.data.delay;
                    if (res.data.coshare_space) {
                        $scope.coshare_space = res.data.coshare_space;
                        for (var i = 0; i < $scope.coshare_options.length; i++) {
                            if ($scope.coshare_space === $scope.coshare_options[i].space) {
                                $scope.coshare_selection = i;
                                break;
                            }
                        }
                    }
                }
                last_full_heartbeat = now;
                if (nbUser.user && !$scope.loaded_source_dev) {
                    console.log('RELOAD SOURCE DEVICE', $scope.device_id);
                    return nbUploadSrv.reload_source($scope.device_id)
                        .then(function() {
                            $scope.loaded_source_dev = true;
                        }, function(err) {
                            console.error('FAILED RELOAD SOURCE DEVICE', $scope.device_id);
                            throw err;
                        });
                }
            }).then(null, function(err) {
                console.error('FAILED DEVICE HEARTBEAT', err);
                close_if_reload_requested(err.data);
                $scope.hearbeat_delay = 10000;
            })['finally'](function() {
                schedule_device();
            });
        }

        $scope.hearbeat_delay = 3000;
        schedule_device();




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
            device_heartbeat(opt.space).then(function() {
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
                (inode.content_kind === 'video' || inode.content_kind === 'audio') &&
                inode.id && inode.id[0] !== 'v') {
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
                    file_url = res.data.fobj_get_url;
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
                        subs: !!local_sub_file
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
                // TODO is this the only unwanted field
                delete item_obj.OEMLogoBitmap;
                list[i] = item_obj;
            }
            return list;
        }

        function wmic_get_list(topic, callback) {
            execute_os(WINDOWS.CMD, ['/c', 'wmic', topic, 'get', '/value'],
                wmic_parse_list, callback);
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

        // init_nbfs_chunks();

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
                                console.log('NBFS recreate chunk with bad type/size', fname, stat);
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

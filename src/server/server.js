'use strict';

process.on('uncaughtException', function(err) {
    console.log(err.stack);
});

if (process.env.NODETIME_ACCOUNT_KEY) {
    require('nodetime').profile({
        accountKey: process.env.NODETIME_ACCOUNT_KEY,
        appName: process.env.NODETIME_APP_DESC
    });
}

// important - dot settings should run before any require() that might use dot
// or else the it will get mess up (like the email.js code)
var dot = require('../utils/dot');
var path = require('path');
var URL = require('url');
var http = require('http');
var dot_emc = require('dot-emc');
var express = require('express');
var express_favicon = require('static-favicon');
var express_morgan_logger = require('morgan');
var express_body_parser = require('body-parser');
var express_cookie_parser = require('cookie-parser');
var express_cookie_session = require('cookie-session');
var express_method_override = require('method-override');
var express_compress = require('compression');
var express_minify = require('express-minify');
var uglifyjs = require('uglify-js');
var passport = require('passport');
var mongoose = require('mongoose');
var _ = require('underscore');
var fs = require('fs');
var mime = require('mime');
// var fbapi = require('facebook-api');
var User = require('./models/user').User;
var common_api = require('./lib/common_api');
var auth = require('./lib/auth');
var inode_api = require('./lib/inode_api');
var user_inodes = require('./lib/user_inodes');
var message_api = require('./lib/message_api');
var user_api = require('./lib/user_api');
var email = require('./lib/email');
var device_api = require('./lib/device_api');
var track_api = require('./lib/track_api');
// var blog_api = require('./lib/blog_api');
var club_api = require('./lib/club_api');
var adminoobaa = require('./lib/adminoobaa');


var rootdir = path.join(__dirname, '..', '..');
var dev_mode = (process.env.DEV_MODE === 'true');
var debug_mode = (process.env.DEBUG_MODE === 'true');


// connect to the database
mongoose.connect(process.env.MONGOHQ_URL);
mongoose.set('debug', debug_mode);

// create express app
var app = express();
var web_port = process.env.PORT || 5000;
app.set('port', web_port);

// setup view template engine with doT
var dot_emc_app = dot_emc.init({
    app: app
});
app.set('views', path.join(rootdir, 'src', 'views'));
app.engine('dot', dot_emc_app.__express);
app.engine('html', dot_emc_app.__express);



////////////////
// MIDDLEWARE //
////////////////

// configure app middleware handlers in the order to use them

app.use(express_favicon(path.join(rootdir, 'images', 'noobaa_icon16.ico')));
app.use(express_morgan_logger('combined'));
app.use(function(req, res, next) {
    // HTTPS redirect:
    // since we want to provide secure and certified connections 
    // for the entire application, so once a request for http arrives,
    // we redirect it to https.
    // it was suggested to use the req.secure flag to check that.
    // however our nodejs server is always http so the flag is false,
    // and on heroku only the router does ssl,
    // so we need to pull the heroku router headers to check.
    var fwd_proto = req.get('X-Forwarded-Proto');
    // var fwd_port = req.get('X-Forwarded-Port');
    // var fwd_from = req.get('X-Forwarded-For');
    // var fwd_start = req.get('X-Request-Start');
    if (fwd_proto === 'http') {
        var host = req.get('Host');
        return res.redirect('https://' + host + req.url);
    }
    return next();
});
app.use(express_cookie_parser(process.env.COOKIE_SECRET));
app.use(express_body_parser.json());
app.use(express_body_parser.raw());
app.use(express_body_parser.text());
app.use(express_body_parser.urlencoded({
    extended: false
}));
app.use(express_method_override());
app.use(express_cookie_session({
    key: 'noobaa_session',
    secret: process.env.COOKIE_SECRET,
    // TODO: setting max-age for all sessions although we prefer only for /auth.html
    // but express/connect seems broken to accept individual session maxAge,
    // although documented to work. people also report it fails.
    maxage: 356 * 24 * 60 * 60 * 1000 // 1 year
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express_compress());



////////////
// ROUTES //
////////////
// using router before static files is optimized
// since we have less routes then files, and the routes are in memory.

app.use('/api/', function(req, res, next) {
    // general validations preceding all the star api functions
    if (!req.user) {
        return error_403(req, res, next);
    }
    return next();
});
app.use('/adminoobaa/', function(req, res, next) {
    // admin validation
    // to make sure admin url cannot be spotted from outside,
    // we skip the route as if it was never defined.
    if (!req.user || !req.user.adminoobaa) {
        console.error('SECURITY ERROR:',
            'User Not Admin', req.user,
            'Headers', req.headers);
        return error_404(req, res, next);
    }
    return next();
});

// setup auth routes

var facebook_auth_path = URL.parse(process.env.FACEBOOK_AUTHORIZED_URL).path;
var google_auth_path = URL.parse(process.env.GOOGLE_AUTHORIZED_URL).path;

app.get(facebook_auth_path, auth.provider_authorized.bind(null, 'facebook'));
app.get(google_auth_path, auth.provider_authorized.bind(null, 'google'));


app.get('/auth/facebook/channel.html', auth.facebook_channel);
app.get('/auth/logout/', auth.logout);

app.get('/auth/facebook/login/', auth.provider_login.bind(null, 'facebook'));
app.get('/auth/google/login/', auth.provider_login.bind(null, 'google'));
app.post('/auth/email/login/', auth.provider_login.bind(null, 'local'), function(req, res) {
    res.send(200);
});


// setup star API routes

app.post('/api/inode/', inode_api.inode_create);
app.get('/api/inode/', inode_api.inode_query);
app.get('/api/inode/:inode_id', inode_api.inode_read);
app.put('/api/inode/:inode_id', inode_api.inode_update);
app.put('/api/inode/:inode_id/copy', inode_api.inode_copy);
app.delete('/api/inode/:inode_id', inode_api.inode_delete);
app.get('/api/inode/:inode_id/ref', inode_api.inode_get_ref);

app.get('/api/inode/src_dev/:device_id', inode_api.inode_source_device);
app.post('/api/inode/:inode_id/multipart/', inode_api.inode_multipart);

app.get('/api/inode/:inode_id/share_list', inode_api.inode_get_share_list);
app.put('/api/inode/:inode_id/share_list', inode_api.inode_set_share_list);

// app.post('/api/inode/:inode_id/link', inode_api.inode_mklink);
// app.delete('/api/inode/:inode_id/link', inode_api.inode_rmlinks);

app.get('/api/inode/:inode_id/message/', message_api.get_inode_messages);
app.post('/api/inode/:inode_id/message/', message_api.post_inode_message);
app.delete('/api/inode/:inode_id/message/:message_id', message_api.delete_inode_message);

app.get('/api/feed/', inode_api.feed_query);

app.get('/api/club/', club_api.poll);
app.post('/api/club/', club_api.create);
app.put('/api/club/:club_id', club_api.update);
app.delete('/api/club/:club_id', club_api.leave);
app.post('/api/club/:club_id/msg', club_api.send);
app.put('/api/club/:club_id/msg', club_api.mark_seen);
app.get('/api/club/:club_id/msg', club_api.read);
app.get('/api/club/list/', club_api.list);

app.get('/api/user/', user_api.user_read);
app.put('/api/user/', user_api.user_update);
app.get('/api/user/friends/', user_api.user_get_friends);
app.post('/api/user/add_ghosts/', user_api.add_ghosts);

app.post('/api/user/feedback/', email.user_feedback);
app.get('/api/emailtest/', email.test_email_templates);

app.post('/api/device/', device_api.device_create);
app.get('/api/device/', device_api.device_list);
app.put('/api/device/:device_id', device_api.device_update);
app.get('/api/device/current/', device_api.device_current);

// app.get('/public_api/blog/', blog_api.blog_list);
// app.get('/public_api/blog/:headline', blog_api.blog_get);

app.all('/track/', track_api.track_event_api);
app.all('/track/pixel/', track_api.track_event_pixel);

// setup admin pages

app.get('/adminoobaa/', function(req, res) {
    return res.render('adminoobaa.html', common_api.common_server_data(req));
});
app.get('/adminoobaa/user/', adminoobaa.admin_get_users);
app.get('/adminoobaa/user/:user_id/usage/', adminoobaa.admin_get_user_usage);
app.all('/adminoobaa/user/:user_id/recent_swm/', adminoobaa.admin_user_notify_by_email);
app.all('/adminoobaa/track/', adminoobaa.admin_get_tracks);
app.all('/adminoobaa/track/csv/', adminoobaa.admin_get_tracks_csv);
app.put('/adminoobaa/', adminoobaa.admin_update);
app.get('/adminoobaa/pull_inodes_fobj/', adminoobaa.admin_pull_inodes_fobj);
app.get('/adminoobaa/pull_inodes_ref/', adminoobaa.admin_pull_inodes_ref);
app.get('/adminoobaa/pull_inodes_shr/', adminoobaa.admin_pull_inodes_shr);

// setup planet pages

app.get('/planet', function(req, res) {
    return res.render('planet_boot.html', common_api.common_server_data(req));
});
app.get('/planet/window', redirect_no_user, function(req, res) {
    return res.redirect('/home/');
});


// setup user pages
var welcome_path = '/welcome';
// var welcome_path = '/home/';

function redirect_no_user(req, res, next) {
    if (!req.user) {
        res.redirect(welcome_path);
        return;
    }
    // if (!req.session.tokens) {
    //     console.log('NO TOKENS FORCE LOGOUT', req.user);
    //     res.redirect('/auth/logout/');
    //     return;
    // }
    if (true || req.user.alpha_tester) {
        return next();
    }

    //in case the user is not an alpha tester - we want to validate in the DB if this is still the case.
    User.findById(req.user.id, function(err, user) {
        if (err) {
            return next(err);
        }
        if (!user) {
            res.redirect('/auth/logout/');
            return;
        }
        if (!user.alpha_tester) {
            res.redirect('/thankyou');
            return;
        }
        //user is an approved user
        return next();
    });
}

app.get('/welcome', function(req, res) {
    // return res.redirect('/home/');
    return res.render('welcome.html', common_api.common_server_data(req));
});

/*
app.get('/gopro', function(req, res) {
    return res.render('welcome.html', common_api.common_server_data(req));
});
app.get('/info', function(req, res) {
    return res.render('info.html', common_api.common_server_data(req));
});
*/

app.get('/thankyou', function(req, res) {
    if (!req.user) {
        return res.redirect(welcome_path);
    }
    return res.render('thankyou.html', common_api.common_server_data(req));
});


app.get('/blog/*', function(req, res) {
    return res.render('blog.html', common_api.common_server_data(req));
});
app.get('/blog', function(req, res) {
    return res.redirect('/blog/');
});

app.get('/home/*', redirect_no_user, function(req, res) {
    var ctx = common_api.common_server_data(req);
    if (req.session.signup) {
        ctx.data.signup = req.session.signup;
        delete req.session.signup;
    }
    if (req.session.signin) {
        ctx.data.signin = req.session.signin;
        delete req.session.signin;
    }
    return res.render('home.html', ctx);
});
app.get('/home', function(req, res) {
    return res.redirect('/home/');
});

app.all('/', redirect_no_user, function(req, res) {
    return res.redirect('/home/');
});



////////////
// STATIC //
////////////

function cache_control(seconds) {
    var millis = 1000 * seconds;
    return function(req, res, next) {
        res.setHeader("Cache-Control", "public, max-age=" + seconds);
        res.setHeader("Expires", new Date(Date.now() + millis).toUTCString());
        return next();
    };
}

// setup static files
app.use('/public/', cache_control(dev_mode ? 0 : 10 * 60)); // 10 minutes
app.use('/public/', express.static(path.join(rootdir, 'build', 'public')));
app.use('/public/images/', cache_control(dev_mode ? 3600 : 24 * 3600)); // 24 hours
app.use('/public/images/', express.static(path.join(rootdir, 'images')));
app.use('/', express.static(path.join(rootdir, 'public')));



// error handlers should be last
// roughly based on express.errorHandler from connect's errorHandler.js
app.use(error_404);
app.use(function(err, req, res, next) {
    console.error('ERROR:', err);
    var e;
    if (dev_mode) {
        // show internal info only on development
        e = err;
    } else {
        e = _.pick(err, 'status', 'message', 'reload');
    }
    e.status = err.status || res.statusCode;
    if (e.status < 400) {
        e.status = 500;
    }
    res.status(e.status);

    if (can_accept_html(req)) {
        var ctx = common_api.common_server_data(req);
        if (dev_mode) {
            e.data = _.extend(ctx.data, e.data);
        } else {
            e.data = ctx.data;
        }
        return res.render('error.html', e);
    } else if (req.accepts('json')) {
        return res.json(e);
    } else {
        return res.type('txt').send(e.message || e.toString());
    }
});

function error_404(req, res, next) {
    return next({
        status: 404, // not found
        message: 'We dug the earth, but couldn\'t find ' + req.originalUrl
    });
}

function error_403(req, res, next) {
    console.log('NO USER', req.originalMethod, req.originalUrl);
    if (can_accept_html(req)) {
        return res.redirect(URL.format({
            pathname: '/auth/facebook/login/',
            query: {
                state: req.originalUrl
            }
        }));
    }
    var err = {
        status: 403, // forbidden
        message: 'NO USER',
        reload: true
    };
    if (req.originalUrl.indexOf('/api/device') === 0) {
        // TEMP FIX:
        // when device api fails on no user, we send the error as success status (200)
        // because old planet code was not reloading on error.
        console.log('FORCE RELOAD DEVICE', req.originalUrl);
        return res.json(200, err);
    }
    return next(err);
}

function error_501(req, res, next) {
    return next({
        status: 501, // not implemented
        message: 'Working on it... ' + req.originalUrl
    });
}

// decide if the client can accept html reply.
// the xhr flag in the request (X-Requested-By header) is not commonly sent
// see https://github.com/angular/angular.js/commit/3a75b1124d062f64093a90b26630938558909e8d
// the accept headers from angular http contain */* so will match anything.
// so finally we fallback to check the url.

function can_accept_html(req) {
    return !req.xhr && req.accepts('html') && req.originalUrl.indexOf('/api/') !== 0;
}




// start http server
var server = http.createServer(app);
server.listen(web_port, function() {
    console.log('Web server on port ' + web_port);
});

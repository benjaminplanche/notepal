var express = require("express");
var fs = require("fs");

var config = require("./config");
var services = require("./services");
var views = require("./views");
var authModule = require("./auth").authModule;

var logger = require("./logger");

// Catch for all exception
process.on('uncaughtException', function (error) {
   logger.error(error.stack);
});

var securityActivated = config.getProperty("security.auth");
logger.warn("Security activated : " + securityActivated);

var sslActivated = config.getProperty("security.ssl");
logger.warn("SSL activated : " + sslActivated);

// REST Server config
var rest;
if(sslActivated) {
	rest = express.createServer({
		key: fs.readFileSync('security/server.key'),
		cert: fs.readFileSync('security/server.crt')
	});
} else {
	rest = express.createServer();
}
rest.configure(function() {
	rest.use(express.bodyParser()); // retrieves automatically req bodies
	rest.use(rest.router); // manually defines the routes
});

// Service:
serviceHandler = {};
//serviceHandler["/xxx"] = services.xxx;

for (var url in serviceHandler) {
	rest.post(url, serviceHandler[url]);
}

logger.warn("REST routes activated.");
rest.listen(1337);
logger.warn("REST server is listening.");

// HTML Server config
var html;
if(sslActivated) {
	html = express.createServer({
		key: fs.readFileSync('security/server.key'),
		cert: fs.readFileSync('security/server.crt')
	});
} else {
	html = express.createServer();
}

html.configure(function() {
	html.use(express.bodyParser());
	html.use(express.static(__dirname + '/public'));
	html.set('views', __dirname + '/views');
	html.set('view engine', 'ejs');
	
	// Stuff needed for sessions
	html.use(express.cookieParser());
	html.use(express.session(
		{ secret: "One does not simply walk into website." }));
});

// Different views of the HTML server :
viewHandler = {};
viewHandler["/(index)?"] = views.index;
viewHandler["/login"] = views.login;
viewHandler["/help"] = views.help;
//viewHandler["/xxx"] = views.xxx;

// Need to be put before * otherwise the star rule catches all the
// requests !
html.post("/auth", authModule.auth);
html.get("/logout", authModule.logout);

viewHandler["*"] = views.notfound;

// handler, user, password
authModule.init(viewHandler);

for (var url in viewHandler) {
	(securityActivated) ? html.get(url, authModule.checkAuth(url))
						: html.get(url, viewHandler[url]);
}

logger.warn("HTML Server routes activated.");
html.listen(8080);

inference.runInference();
logger.warn("HTML Server is listening.");

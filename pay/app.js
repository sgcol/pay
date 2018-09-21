const server = require('http').createServer()
, url = require('url')
, path = require('path')
, request = require('request')
, express = require('express')
, app = express()
, compression = require('compression')
, bodyParser = require('body-parser')
, qs = require('querystring')
, sortObj=require('sort-object')
, merge = require('gy-merge')
, fs = require('fs')
, subdirs = require('subdirs')
, del = require('delete')
, argv = require('yargs')
    .default('port', 80)
    .boolean('debugout')
    .boolean('dev')
    .argv;

// const getDB = require('./server/db.js'), ObjectID = require('mongodb').ObjectID;;
var db = null;
confirmOrder = function () {
    var cb = arguments[arguments.length - 1];
    cb('db is not inited');
}
const crypto=require('crypto');
const md5 = function (str, length) {
    var buf = new Buffer(str.length * 2 + 1);
    var len = buf.write(str, 0);
    str = buf.toString('binary', 0, len);
    var md5sum = crypto.createHash('md5');
    md5sum.update(str);
    str = md5sum.digest('hex');
    if (length == 16) {
        str = str.substr(8, 16);
    }
    return str;
}
var httpf = require('httpf'), debugout = require('debugout')(argv.debugout);

var external_pf = {};
var tt = require('gy-module-loader')(path.join(__dirname, 'server/pf/*.pf.js'), function () {
    var keys = Object.keys(tt);
    for (var i = 0; i < keys.length; i++) {
        external_pf[path.basename(keys[i], '.pf.js')] = tt[keys[i]];
    }
});

if (argv.debugout) {
    app.use(function (req, res, next) {
        debugout('access', req.url);
        next();
    });
}

app.use(compression());
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'bin'), { index: 'index.html' }));
app.param('interface', function (req, res, next, intf) {
    req.pf = intf;
    next();
});
app.use('/pf/:interface', function (req, res, next) {
    debugout('pf', req.pf);
    if (external_pf[req.pf]) return external_pf[req.pf].call(null, req, res, function () { res.status(404).send({err:'no such function ' + req.url, detail:arguments}); });
    res.end('pf ' + req.pf + ' not defined');
});
function dateString(d) {
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
const mkdirp = require('mkdirp');

function isIPv4(str) {
    var reg = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return reg.test(str);
}
var Address6 = require('ip-address').Address6;

const key='Qztbet4J8uznaBeP';
function verifySign(req, res, next) {
    var _p=merge(req.query, req.body), sign=_p.sign;
    if (!sign) return res.send({err:'没有签名sign'});

    delete _p.sign;
    var wanted=md5(key+qs.stringify(sortObj(_p)));
    if (sign!=wanted) {
        var e={err:'签名错误'};
        if (argv.debugout) {
            e.wanted=wanted;
            e.str=key+qs.stringify(sortObj(_p));
        }
        return res.send(e);
    }
    next();
}
function getHost(req) {
    return url.format({protocol:req.protocol, hostname:req.hostname, port:server.address().port});
}

// getDB(function (err, db, easym) {
    // if (err) return console.log(err);
    server.on('request', app);
	server.listen(argv.port, function () { console.log('Listening on ' + server.address().port) });
    // 购买支持
    var order={};
    app.all('/test/pay', verifySign, httpf({ orderid: 'string', money:'number', perfer:'string', no_return: true }, function (orderid, money, perfer) {
        order.id=orderid;
        order.money=money;
        this.res.send(`
        <H1>TEST PAY PAGE</H1>
        <form action='${getHost(this.req)}/test/confirm' method="post">
        <input type="hidden" name="orderid" value="${orderid}" />
        <p>按下按钮完成充值</p><input type="submit" value="Submit" />
        </form>
        `);
    }));
    app.all('/test/confirm', httpf({orderid:'string', no_return:true}, function(orderid) {
        if (orderid!=order.id) return this.res.send(`
            <H1>TEST PAY PAGE</H1>
            <p>orderid不正确</p>
            `);
        // call do_pay
        this.res.send(`
        <H1>TEST PAY PAGE</H1>
        <p>充值完成</p>
        `);
    }));
    var dispatchOrders={};
    app.all('/test/dispatch', verifySign, httpf({orderid:'string', money:'number', alipay:'?string', wechat:'?string', bankName:'?string', bankBranch:'?string', bankCard:'?string', bankOwner:'string', callback:true}, 
    function(orderid, money, alipay, wechat, bankName, bankBranch, bankCard, bankOwner, callback) {
        if (!argv.debugout) return callback({text:'only availble in debugout mode'});
        if (dispatchOrders[orderid]) return callback({text:'repeat orderid'})
        dispatchOrders[orderid]={
            money:money, alipay:alipay, wechat:wechat, bankNmae:bankName, bankOwner:bankOwner, bankBranch:bankBranch, bankCard:bankCard
        }
        callback(null, {text:'processing', url:`${getHost(this.req)}/test/order?orderid=${orderid}`});
    }));
    app.all('/test/order', httpf({orderid:'string', no_return:true}, function(orderid) {
        var order=dispatchOrders[orderid];
        if (!order) return this.res.send(`
        <H1>Order not found</H1>
        <p>${orderid}不存在</p>
        `);
        return this.res.send(`
        <H1>Order ${orderid}</H1>
        <ul>
        <li>支付宝${order.alipay}</li>
        <li>微信${order.wechat}</li>
        <li>姓名${order.bankOwner}</li>
        `);
    }));
    app.all('/test/dispatchStatus', verifySign, httpf({orderids:'array'}, function(orderids) {
        var ret={};
        for (var i=0; i<orderids.length; i++) {
            var oid=orderids[i];
            ret[oid]={text:dispatchOrders[oid]?'测试':'不存在'};
        }
        return ret;
    }));
// })
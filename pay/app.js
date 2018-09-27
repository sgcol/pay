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
, getDB=require('./db.js')
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
global.verifySign =function(req, res, next) {
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
global.getHost=function(req) {
    return url.format({protocol:req.protocol, host:req.headers.host});
}

global.isNumeric=function(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

getDB(function (err, db, easym) {
    if (err) return console.log(err);
    // init pfs
    var tt = require('gy-module-loader')(path.join(__dirname, 'pf/*.pf.js'), function () {
        var keys = Object.keys(tt);
        for (var i = 0; i < keys.length; i++) {
            external_pf[path.basename(keys[i], '.pf.js')] = tt[keys[i]];
        }
    });
    server.on('request', app);
	server.listen(argv.port, function () { console.log('Listening on ' + server.address().port) });
    // 购买支持
    function createOrder(externOrderid, money, callback) {
        try {
        if (!money || !isNumeric(money)) return callback('money必须是数字');
        if (Math.ceil(money*100)!=money*100) return callback('money 最多有两位小数');
		db.bills.insertOne({ externOrder:externOrderid, time: new Date(), money:money, completeTime:new Date(0), used:false}, function (err, r) {
			if (err) return callback(err);
			callback(null, { orderid: r.insertedId, money: money });
        });
    }catch(e) {debugout(e)}
    }
    confirmOrder=function (orderid, money, callback) {
        debugout('confirmOrder', orderid, money);
        if (typeof money=='fucntion') {
            callback=money;money=null;
        }
		var self = this;
		var key = { _id: ObjectID(orderid) };
		db.bills.find(key).limit(1).next(function (err, order) {
			debugout('co, db ret', err, order);
			if (err) return callback(err);
			if (order == null) return callback('无此订单' + orderid);
			if (order.used) return callback('订单已使用@' + order.used);
			if (money != null && order.money != money) return callback('充值金额不对');
			db.bills.updateOne(key, { $set: { used: true , completeTime:new Date()} }, function(err) {
				debugout('upd reciept', err);
            });
            var param={orderid:orderid};
            param.sign=md5(key+qs.stringify(sortObj(param)));
            request.post({uri:url.format({host:'sgg.cool', pathname:'index.php/agency/bsyl/h5notify'}), formData:param}, function(err, response, body) {
                debugout('confirm, http ret', err, body);
                if (err) return callback(err);
                try {
                    var ret=JSON.parse(body);
                } catch(e) {
                    return callback(e);
                }
                if (ret.code!=0) return callback(ret.msg);
                callback(null);
            });
		})
    }
    global.intfCreateOrder=function(callback) {
        return function(req, res) {
            verifySign(req, res, function() {
                debugout('verified');
                httpf({ orderid: 'string', money:'number', perfer:'?string', prefer:'?string', no_return: true }, function (orderid, money, perfer, prefer) {
                    debugout('recieved', orderid, money);
                    prefer=prefer||perfer;
                    createOrder(orderid, money, function(err, order) {
                        if (err) return callback.call({req:req, res:res}, err);
                        callback.call({req:req, res:res}, null, order.orderid, order.money, prefer);
                    });
                })(req, res);
            })
        }
    }
    if (!argv.debugout) return;
    var order={};
    app.all('/test/pay', verifySign, httpf({ orderid: 'string', money:'number', perfer:'?string', prefer:'?string', no_return: true }, function (orderid, money, perfer, prefer) {
        // debugout(this.req);
        prefer=prefer||perfer;
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
        var res=this.res;
        var param={orderid:orderid};
        param.sign=md5(key+qs.stringify(sortObj(param)));
        request.post({uri:url.format({host:'sgg.cool', protocol:this.req.protocol, pathname:'index.php/agency/bsyl/h5notify'}), formData:param}, function(err, response, body) {
            if (err) return res.send(`
                <H1>TEST PAY PAGE</H1>
                <p>失败${err}</p>
            `);
            try {
                var ret=JSON.parse(body);
            } catch(e) {
                return res.send(`
                <H1>TEST PAY PAGE</H1>
                <p><li>错误 ${err} </li><li>org ${body}</li></p>
                `);
            }
            if (ret.code!=0) return res.send(`
                <H1>TEST PAY PAGE</H1>
                <p><li>充值失败 ${ret.msg}</li><li>${JSON.stringify(param)}</li></p>
            `);
            res.send(`
            <H1>TEST PAY PAGE</H1>
            <p>充值完成</p>
            `);
        });
    }));
    var dispatchOrders={};
    app.all('/test/dispatch', verifySign, httpf({orderid:'string', money:'number', alipay:'?string', wechat:'?string', bankName:'?string', bankBranch:'?string', bankCard:'?string', bankOwner:'string', mobile:'string', callback:true}, 
    function(orderid, money, alipay, wechat, bankName, bankBranch, bankCard, bankOwner, mobile, callback) {
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
            ret[oid]={text:dispatchOrders[oid]?'测试':'不存在', url:'http://baidu.com'};
        }
        return ret;
    }));
})
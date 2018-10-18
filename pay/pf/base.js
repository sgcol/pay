const getDB=require('../db.js'),argv=require('yargs').argv;
var ali_bank_keyl;
if (argv.dev) {
	ali_bank_key='fa2b27966ef04e45817efae241e78e77';  // test version
} else {
	ali_bank_key='f464a60834c944d4a8955432ff5d0b8c';     // formal edition
}

module.exports.getBank=function(order, cb) {
    getDB(function(err, db) {
        if (err) return cb(err);
        db.knownCard.find({_id:order.account_no}).toArray(function(err,  r) {
            if (!err && r.length>0) {
                return cb(null, [r[0]]);
            }
            request({uri:`http://cnaps.market.alicloudapi.com/lianzhuo/querybankaps?`+qs({card:order.account_no, key:order.bank_firm_name}), headers:{Authorization:'APPCODE '+ali_bank_key}}, function(err, header, body) {
                debugout(err, body);
                if (err) return cb(err);
                try {
                    var bankinfo=JSON.parse(body);
                } catch(e) {
                    return cb({title:'阿里银行接口没钱'});
                }
                if (bankinfo.resp.RespCode!='200') {
                    if (bankinfo.resp.RespCode=='502') return cb({message:'找不到银行，如果不清楚支行全名时可以只输入xx支行<br>请在返回之后点击 驳回， 并通知代理修改银行信息之后再次提交', title:'银行信息错误', noretry:true});
                    return cb({title:'获取银行信息失败', message:bankinfo.resp.RespMsg+' 请在返回后点击 驳回'});
                }
                if (bankinfo.data.record.length==1) {
                    var o=clone(bankinfo.data.record[0]);
                    db.knownCard.updateOne({_id:order.account_no}, o, {upsert:true},function(){});
                }
                cb(null, bankinfo.data.record);
            })
        })    
    })
}

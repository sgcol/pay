(function ($) {
    "use strict";
    window.getAjax=function getAjax(_url, data, callback) {
        if (typeof data ==='function') {
            callback =data;
            data=null;
        }
        if (!callback) callback=function(){};
        var addr=_url;
        $.ajax({
            type: "POST",
            url: addr,
            dataType: "JSON",
            data: data,
            timeout:30000,
            success: function (chunk) {
                if (chunk.err) return callback(chunk.err, chunk);
                return callback(null, chunk);
            },
            error: function (e) {
                callback(e);
            }
        })
    }

    window.accIntf=function(_url, data, callback) {
        if (typeof data=='function') {
            callback=data;
            data=null;
        }
        getAjax(_url ,data, function(err, r) {
            if (err && err=='no auth') {
                location.href='/login.html';
                return;
            }
            return callback && callback(err, r);
        })
    }
    function delete_cookie( name ) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    }
    window.logout=function() {
        delete_cookie('a');
        location.href='/';
    }
    window.errstr=function(e) {
        if (typeof e=='string') return e;
        if (typeof e=='object') {
            var err=e.message||e.msg||e.statusText;
            if (err) return err;
            return e.toString();
        }
        return e;
    }
    window.showerr=function(e) {
        alert(errstr(e));
    }

    $(function() {
        accIntf('/account/me', function(err, me) {
          if (err) return;
          window.me=me;
          $('.username').text(me.name||'');
          $('.acl').text(me.acl||'访客');
          typeof window.initpage=='function' && window.initpage();
        })
    });

})(jQuery)
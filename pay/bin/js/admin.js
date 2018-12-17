function remove(account) {
    accIntf('/admin/removeAccount', {account:account}, (err)=>{
        if (err) return showerr(err);
        getlist();
    });
}
var url=location.pathname, filename = url.substring(url.lastIndexOf('/')+1);
const etc={
    'admin.html':{identity:["manager", "admin"], badge:'badge-danger'},
    'merchant.html':{identity:"merchant", badge:'badge-success'},
    'agent.html':{identity:"agent", badge:'badge-warning'},
}
const data=etc[filename]||{identity:'', badge:''};
function getlist() {
    accIntf('/admin/listAccount', {identity:data.identity}, function(err, r) {
        if (err) return showerr(err);
        $('#list').html(ejs.render(`<%r.forEach(function(item) { %>
            <tr>
            <td><%= item.name||'未填写'%></td>
            <td><%= item._id%></td>
            <td><%= item.createTime?new Date(item.createTime).toLocaleDateString():'未知'%></td>
            <td><label class="badge <%= data.badge%>"><%= item.acl%></label></td>
            <% if(filename=='merchant.html') {%>
                <td><%= item.key%></td>
                <td><%= item.merchantid%></td>
                <td><div class="form-check"><label class="form-check-label"><input type="checkbox" class="form-check-input" merchantid="<%= item.merchantid%>" <%= item.debugMode?'checked':''%>>
                  debuging
                  <i class="input-helper"></i>
                </label>
                </div>
                </td>
            <%}%>
            <td>
            <button type="button" class="btn btn-outline-primary btn-icon" data-toggle="modal" data-target="#editMerchant" data-merchantid="<%= item._id%>"><i class="mdi mdi-key-change"></i></button>
            <button type="button" class="btn btn-outline-secondary btn-icon" onclick="javascript:remove('<%= item._id%>')"><i class="mdi mdi-delete-forever"></i></button>
            </td>
        <% })%>`, {r:r.message, filename:filename}));
        typeof onListChanged=='function' && onListChanged.call($('#list'));
    })  
}
$(getlist);
$('#addacc').submit((e)=>{
    e.preventDefault();
    var f=$('#addacc input'), o={}, alldone=true;;
    for (var i=0; i<f.length; i++) {
      var item=f[i];
      if (!item.name) continue;
      if (!item.value) {
        alldone=false;
        $(item).addClass('wrong');
      } else $(item).removeClass('wrong');
      o[f[i].name]=f[i].value;
    }
    if (!alldone) return;
    accIntf('/admin/addAccount', o, function(err) {
      if (err) return showerr(err);
      getlist();
    });
  })

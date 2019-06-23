var ListAjax = function({target_element = document}){
    var elements = target_element.getElementsByClassName('list-ajax') ;

    Array.prototype.forEach.call(elements , (element)=>{
        //LOAD LIST
        LoadList(element) ;
    });
}

ListAjax.prototype.LoadList =async function(element) {
    await new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', element.dataset.dataUrl);
        xhr.onload = function () {
          if (this.status >= 200 && this.status < 300) {
            element.getElementsByClassName('list-data')[0].html = xhr.response ;
          } else {
            reject({
              status: this.status,
              statusText: xhr.statusText
            });
          }
        };
        xhr.onerror = function () {
          reject({
            status: this.status,
            statusText: xhr.statusText
          });
        };
        xhr.send();
      });
}

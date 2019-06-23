var id = 1 ; //init
var announcement_div = '#announcement-div' ; 
var announcements = [] ;
class Announcement{
    
    constructor(data){     
        var self=this ;
        this.id = `announcement_${id++}` ;

        if(null==data){
            data = {'text':""} ;
        }
        this.add_announcement(data) ;

        this.element.querySelector('#del_btn').onclick = function() {
            self.delete() ;
            var index = announcements.indexOf(self);
            if (index > -1) {
                announcements.splice(index, 1);
            };
            console.log(announcements);
        }
    }
    
    add_announcement(data){
        var target = document.querySelector(announcement_div);
        var d = document.createElement('div');     
        d.innerHTML = this.html(data) ;
        
        target.appendChild(d);


    }
    get json() {
      return {'text':this.text}
    };

    delete() {
        this.element.parentNode.removeChild(this.element);
    }

    html(data) {
        return `
        <div class="element" id="${this.id}">
            <div class="element-header">
                <input id='text' class='txt txt-fill' type='text' value="${data.text}"/>
                <button id='del_btn' class='btn-sqr'>-</button>
            </div>
            
            <div class="element-body">
                    <!-- <div class='element-row'>
                            <input type='checkbox' id='tgl-time' value='Su'><label for='tgl-time'>Time</label>
                            <input class='data-input' type='time'>
                            <span>   -    </span>
                            <input class='data-input' type='time'>
                    </div>    
                    <div class='element-row'>
                            <input class='data-input' type='date'>
                            <span> - </span>
                            <input class='data-input' type='date'>
                    </div>    
                    <div class='element-row'>
                            <input type='checkbox' id='sunday' value='Su'><label for='sunday'>Su</label>
                            <input type='checkbox' id='monday' value='M'><label for='monday'>M</label>
                            <input type='checkbox' id='tuesday' value='Tu'><label for='tuesday'>Tu</label>
                            <input type='checkbox' id='wednesday' value='W'><label for='wednesday'>W</label>
                            <input type='checkbox' id='thursday' value='Th'><label for='thursday'>Th</label>
                            <input type='checkbox' id='friday' value='F'><label for='friday'>F</label>
                            <input type='checkbox' id='saturday' value='Sa'><label for='saturday'>Sa</label>
                            <div class='element-item'></div>    
                            <div class='element-item'></div>    
                    </div>      -->
            </div>
        </div>        
        `
        
    }

    get element(){
        return document.getElementById(this.id) ;
    }
    get text(){
        return this.element.querySelectorAll("#text")[0].value;
    }
}

var doc_ready = function () {
    var self = this ;
    // Handler when the DOM is fully loaded
    //GET LIST OF ALL ANNOUCNEMENTS

    function reqListener() {
        console.log(this.responseText);
        var resJSON = JSON.parse(this.responseText) ;
        console.log (resJSON.announcements) ;
        resJSON.announcements.forEach((e,i,a)=>{
            announcements.push(new Announcement(e)) ;
        })
    }

    var oReq = new XMLHttpRequest();
    oReq.addEventListener("load", reqListener);
    oReq.open("GET", "/announcements/api/html");
    oReq.send();

    
    document.getElementById('save_btn').onclick = function() {
        function reqListener() {
            console.log (this.responseText) ;
        }

        var oReq = new XMLHttpRequest();
        oReq.addEventListener("load", reqListener);
        oReq.open("POST", "/announcements/api/post_announcements");
        oReq.setRequestHeader("Content-Type", "text/plain");

        var a = {"announcements" : 
            announcements.map((e,i,a)=>{
                return e.json ;
            }) 
        } ;

        var data = JSON.stringify(a);
        oReq.send(data);
    };

    
    document.getElementById('create_btn').onclick = function() {
        announcements.push(new Announcement()) ;
    }

};

if (
    document.readyState === "complete" ||
    (document.readyState !== "loading" && !document.documentElement.doScroll)
) {
    callback();
} else {
    document.addEventListener("DOMContentLoaded", doc_ready);
}



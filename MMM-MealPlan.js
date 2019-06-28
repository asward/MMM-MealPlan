Module.register("MMM-MealPlan",{
    index: 0,
    meal_plan: [],
    defaults:{
        num_days: 7,
        generateMeals: false ,
    },

    //SELECTS and lists your meals for the week! Enter list of all meals you regularly prepare. Browse
    //to {server}/mealplan and select "New Plan" to generate a new list. The meals for the following week
    //will be selected at random and displayed on your magic mirror. You may edit the list to your liking.

    getCurrentMealPlan: function(){
        //RETURNS CURRENTLY SELECTED MEAL PLAN FROM DATABASE
        var currentMeals = this.meals.find({ selected: {'$eq': true} });

        return currentMeals; 
    },
    
    getHeader: function() {
		return this.data.header ;
    },
    
	// Override dom generator.
	getDom: function() {
        var self = this ;

        if (self.meal_plan){
            var wrapper = document.createElement("div");
            var table = document.createElement("table");
            table.classList.add('small');
            self.meal_plan.forEach((el)=>{
                var tr = document.createElement("tr");
                var td_date =  document.createElement("td");
                td_date.style.paddingRight = "5px";
                
                td_date.innerHTML = moment(el.date).format('ddd');
                var td_name  =  document.createElement("td");
                td_name.innerHTML = el.name ;
                tr.appendChild(td_date);
                tr.appendChild(td_name);
                table.appendChild(tr) ;
            })
            wrapper.appendChild(table) ;
            return wrapper;
        }
        return "" ;
    },
    start: function() {
        var self = this ;

        this.sendSocketNotification('SET_CONFIG', this.config);
        
        Log.log(this.name + ' is started!');        

        self.updateDom(0);

        this.getMealPlan();
        setInterval(()=>{
            this.getMealPlan();
        },60*60*1000);
        
    },
    
    getMealPlan: function(){
        this.sendSocketNotification('GET_MEAL_PLAN', {start_date:moment().format('YYYYMMDD'),num_days:this.config.num_days});
    },

    socketNotificationReceived:function(notification, payload) {
        var self = this ;
        if (notification == "UPDATE_MEAL_PLAN") {
            
            Log.log(this.name + " received a module notification: " + notification);
            self.meal_plan = payload;
            self.updateDom(0);
        }  else if(notification = "MEAL_PLAN_UPDATED"){
            self.getMealPlan() ;      
        }
    },
    
	getScripts: function() {
        return ["moment.js"];
	},
});
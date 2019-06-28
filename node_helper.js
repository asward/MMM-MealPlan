
const NodeHelper = require("node_helper");
const path = require("path");
const url = require("url");
const fs = require("fs");
const bodyParser = require("body-parser");

const express = require('express'); 
const loki = require('lokijs');
const moment = require('moment');

Module = {
	configDefaults: {num_days: 7},
	register: function (name, moduleDefinition) {
		// console.log("Module config loaded: " + name);
		Module.configDefaults[name] = moduleDefinition.defaults;
	}
};

module.exports = NodeHelper.create({
    // Subclass start method.
	start: function() {
        var self = this;
        
        this.db = new loki(path.resolve(this.path + '/db/mealplan.json'), 
        {
            autosave: true,
            autosaveInterval: 5000, 
            autoload: true, 
            autoloadCallback: self.databaseInitialize.bind(self),
        });

        self.textParser = bodyParser.text() ;   
        self.jsonParser = bodyParser.json() ;   

		console.log("Starting node helper for: " + self.name);
        
        this.createRoutes();    
    },

    databaseInitialize: function() {
        var self= this ;

        self.meals = self.db.getCollection('meals'); 
        self.plans = self.db.getCollection('plans');

        if (self.meals === null) {
            self.meals = self.db.addCollection("meals");
        }

        if (self.plans === null) {
            self.plans = self.db.addCollection("plans");
        }

        self.db.saveDatabase() ;  
    },

    socketNotificationReceived: function(notification, payload) {
        var self = this ;
        console.log(this.name + " received a socket notification: " + notification + " - Payload: " + payload);

        if (notification == "GET_MEAL_PLAN"){
            console.log(this.name + " Sending Meal Plan ");
            
            self.sendSocketNotification('UPDATE_MEAL_PLAN', self.getMealPlan(payload.start_date,payload.num_days,false));
        } 
        else if (notification === "SET_CONFIG")
        {
            this.config = payload;
            console.log(this.config);
        }  
    },

    getRandomMeal: function(){ 
        // RANDOMLY PICK A MEAL
        var meal_ids = this.meals.where(x=>true).map(m=>m.$loki);
        var random_meal_id_index = Math.floor(Math.random() *  meal_ids.length);
        return self.meals.findOne( { '$loki': { '$eq' :meal_ids[random_meal_id_index] } });
    },
    
    getMealPlan: function(start_date,num_days,auto_generate){
        
        var self = this ;
        //GETS days_ahead FROM TODAYS DATE OF MEALS
        //DB STORES ID FOR THE MEAL
        //METHOD RETURNS THE NAME OF THE MEAL
        //IF DB DOESN"T CONTAIN DATA FOR THOSE DATES IT'S GENERATED RANDOMLY
        var meal_plan = [];
        for(i=0;i<num_days;i++){
            //GET EACH DAY PLANNED
            var searchDate =  moment(start_date).add(i,'day').format('YYYYMMDD') ;
            
            //PULL THE PLAN
            var plan = self.plans.findOne( { date: { '$eq' :searchDate } } ) ;
            var meal = null ;

            if(plan){
                //FIND THE MEAL
                meal = self.meals.findOne( { '$loki': { '$eq' :plan.meal_id } })  ;
            }  
            
            if (!meal){
                if(auto_generate){
                    //IF ALLOWED TO GENERATE MEALS, PICK A RANDOM ONE AND INSTER TO PLANNED_MEALS
                    meal = self.getRandomMeal() ;
                    plan = {meal_id:meal.$loki,date:searchDate} ;
                    self.plans.insert(plan) ;
                }  else {
                    //IF NO PLAN, AND NOT GENERATING MEALS CREATE AN 'EMPTY' MEAL
                    meal = {
                        name:'???'
                    };
                }
            }
            
            //PUSH INTO MEAL_PLAN ARRY
            meal_plan.push({
                name: meal.name,
                date: searchDate,
                display_date: moment(searchDate).format('ddd, MMM DD')
            }) ;

        }
        return meal_plan ;            
    },

    getAllMeals: function(){
        var meals =  this.meals.chain().data().sort((a,b)=>{return a.name.localeCompare(b.name);}).map((m)=>{
            m.id = m.$loki;
            return m;
        });     
        return meals ;
    },
    createNewMeal: function(meal_name){
        var self = this ;
        new_meal = {} ;

        new_meal.name = meal_name ;

        // console.log(new_meal.name);

        //ADD TO DB
        self.meals.insert(new_meal) 
        self.db.save() ;

        return  self.meals.findOne( { name: { '$eq' : meal_name} } ) ;
    },
    createRoutes: function(){
        var self = this ;

        
        ///MAIN- MEALPLAN
        self.expressApp.route('/mealplan')
        .get(function (req, res) {
            var meal_plan_index = self.renderTemplate('/public/mealplan/mealplan_index.html', {});
            var buttons = self.renderTemplate('/public/view_meals_btn.html', {});
        
            var template =  self.renderTemplate('/public/template.html',
            {
                content:  meal_plan_index,
                buttons:  buttons
            }) ;
            res.send(template); 
        });

        
        ///MAIN- MEALPLAN
        self.expressApp.route('/partial/mealplan/:date_start/:num_days')
        .get(function (req, res) {

            var date_start = req.params.date_start ;
            var num_days = req.params.num_days ;

            var currentMealPlanListItems = self.renderListTemplate('/public/mealplan/mealplan_list_item.html', self.getMealPlan(date_start,num_days));
            var currentMealPlanList = self.renderTemplate('/public/mealplan/mealplan_list.html', {meal_list:currentMealPlanListItems});
        
            res.send(new Buffer(currentMealPlanList)); 
        });


        ///EDIT PLANNED MEAL - GET
        self.expressApp.get('/mealplan/edit/:date_id', self.textParser, function (req, res) {
            //EDIT SINGLE MEAL
            var meal_name_option_list = self.renderListTemplate('/public/option_list.html',self.getAllMeals().map((m) => ({'data': m.name})));

            var plan = self.plans.findOne( { date: { '$eq' : req.params.date_id} } ) ;
            if(!plan){
                plan = { meal_id:null,date:req.params.date_id }
            }

            var meal = self.meals.findOne( { "$loki": { '$eq' :plan.meal_id} } ) ;    
            if(!meal){
                meal = {name:''}
            }                
                
            var template = self.renderTemplate('/public/planned_meal/edit_planned_meal.html',
            {
                meal_name:meal.name,
                meal_date:moment(plan.date).format('dddd, MMMM Do'),
                meal_name_list: meal_name_option_list,

            });
            template = self.renderTemplate('/public/template.html',{content: template});

            res.send(template); 

        });
        
        ///EDIT PLANNED MEAL - POST
        self.expressApp.post('/mealplan/edit/:date_id', bodyParser.urlencoded({
            extended: false
        }), function (req, res) {
            //UPDATE SINGLE MEAL
            //PUT (UPDATE) MEAL

            if (!req.body){
                return res.sendStatus(400)
            } 

            var meal  = self.meals.findOne( { name: { '$eq' : req.body.mealName} } ) ;
            if(!meal){
                meal = self.createNewMeal(req.body.mealName);
            }

            var plan = self.plans.findOne( { date: { '$eq' : req.params.date_id} } ) ;
            if(!plan) {
                plan = {meal_id:meal.$loki,date:req.params.date_id}    
                self.plans.insert(plan);
            }

            plan.meal_id = meal.$loki ;
            self.plans.update(plan);

            self.sendSocketNotification('MEAL_PLAN_UPDATED', {});    

            res.redirect('/mealplan');
        });

        
        
        ///MAIN - MEALLIST
        self.expressApp.route('/mealplan/meallist')
        .get(function (req, res) {
            var currentMealListItems = self.renderListTemplate('/public/meal/meal_list_item.html', self.getAllMeals());
            var currentMealList = self.renderTemplate('/public/meal/meal_list.html', {meal_list:currentMealListItems});
            var buttons = self.renderTemplate('/public/create_meal_btn.html', {});
            
            var template =  self.renderTemplate('/public/template.html',
            {
                content: currentMealList,
                buttons:  buttons
            }) ;
            res.send(template); 
        });

        //CREATE MEAL - POST
        self.expressApp.post('/mealplan/meallist/createmeal', bodyParser.urlencoded({
            extended: false
        }), function (req, res) {

            // POST NEW MEAL

            if (!req.body){
                return res.sendStatus(400)
            } 

            //VALIDATE FORM

            //IF FORM IS VALID
            self.createNewMeal(req.body.name);           

            res.redirect('/mealplan');
            //ELSE
            //RETURN FORM WITH DATA AND ERRORS
            
        });

        ///CREATE MEAL - GET        
        self.expressApp.get('/mealplan/meallist/createmeal', self.textParser, function (req, res) {
            //GET CREATE MEAL
            var template =  self.renderTemplate('/public/template.html',
                {content:self.renderTemplate('/public/meal/create_meal.html')}
                ) ;    
                res.send(template) ;
        });

        ///EDIT MEAL - GET        
        self.expressApp.get('/mealplan/meallist/edit/:meal_id', self.textParser, function (req, res) {
            //GET CREATE MEAL
            //FIND EXISTING MEAL

            // console.log(parseInt(req.params.id));
            
            // console.log(self.meals) ;
            // var existingMeal = self.meals.chain().data({removeMeta:true})[0];

            var existingMeal = self.meals.findOne( { '$loki': { '$eq' : parseInt(req.params.meal_id) } });
            // console.log(existingMeal);
            if(existingMeal){

                var creatMealForm = self.renderTemplate('/public/meal/edit_meal.html',existingMeal) ;
                var template =  self.renderTemplate('/public/template.html', {content:creatMealForm}) ;    
                res.send(template) ;
            } else {
                res.send(self.get404());
            }
            
        });

        ///EDIT MEAL - POST        
        self.expressApp.post('/mealplan/meallist/edit/:meal_id',  bodyParser.urlencoded({
            extended: false
        }), function (req, res) {
            //POST EDIT MEAL
            // POST NEW MEAL
        
            // console.log('posting a meal edit') ;
            if (!req.body){
                return res.sendStatus(400)
            } 

            var existingMeal = self.meals.findOne( { "$loki": { '$eq' :parseInt(req.params.meal_id) } }) ;
            // console.log(existingMeal) ;
            if(existingMeal){

                //VALIDATE FORM

                //IF FORM IS VALID                
                if(req.body.action == "Update"){
                    existingMeal.name = req.body.name
                    self.meals.update(existingMeal);
                } else if (req.body.action == "Delete"){
                    self.meals.remove(existingMeal);
                }

                self.sendSocketNotification('MEAL_PLAN_UPDATED', {});
            }

            res.redirect('/mealplan/meallist');

            //ELSE
            //RETURN FORM WITH DATA AND ERRORS
        });

        ////// STATIC //////
        this.expressApp.use('/mealplan/public', express.static(path.join(self.path + '/public/')))

    },
    
    renderTemplate: function(template_path, data = {}){
        var template =  fs.readFileSync(path.resolve(this.path + template_path)).toString() ;

        //LOAD DATA
        Object.entries(data).forEach( (o) => {
            const regexp = new RegExp(`{{${o[0]}}}`,'g');
            template = template.replace(regexp,`${o[1]}`)  ;
        })
        
        //REMOVE EXTRA {{}}
        const regexp = new RegExp(`{{.*}}`,'g');
        template = template.replace(regexp,``)  ;
        

        return template ;
    },

    renderListTemplate: function(list_template_path, data = []){
        var template = '' ;
        data.forEach((item)=>{
            template += this.renderTemplate(list_template_path,item) ;
        }) ;
        
        return template ;
    },

    get404: function(){
        var self= this;
        var html404 =  fs.readFileSync(path.resolve(this.path + "/public/404.html")).toString() ;

        return self.renderTemplate('/public/template.html',{content: html404 });
    },

    announcementHTML: function(){
        var html = this.renderListTemplate('/public/announcement_list_item.html',this.announcements.announcements) ;
        html = this.renderTemplate('/public/announcement_list.html',{list: html}) ;
        return html ;
    },
    createHTML: function(){
        var html = this.renderListTemplate('/public/mealplan_list_item.html',this.announcements.announcements) ;
        html = this.renderTemplate('/public/create.html',{list: html}) ;
        return html ;
    }
});
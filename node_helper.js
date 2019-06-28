
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
        self.planned_meals = self.db.getCollection('planned_meals');

        if (self.meals === null) {
            self.meals = self.db.addCollection("meals");
        }

        if (self.planned_meals === null) {
            self.planned_meals = self.db.addCollection("planned_meals");
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
            var planned_meal = self.planned_meals.findOne( { date: { '$eq' :searchDate } } ) ;
            var meal = {} ;

            if(planned_meal){
                //FIND THE MEAL
                meal = self.meals.findOne( { '$loki': { '$eq' :planned_meal.id } })  ;
            }  else if (auto_generate){
                //IF ALLOWED TO GENERATE MEALS, PICK A RANDOM ONE AND INSTER TO PLANNED_MEALS
                meal = self.getRandomMeal() ;
                planned_meal = {id:meal.$loki,date:searchDate} ;
                self.planned_meals.insert(planned_meal) ;
            } else {
                //IF NO PLAN, AND NOT GENERATING MEALS CREATE AN 'EMPTY' MEAL
                meal = {
                    name:'???'
                };
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

    getMeals: function(){
        var self = this ;
        //GETS days_ahead FROM TODAYS DATE OF MEALS
        //IF DB DOESN"T CONTAIN DATA FOR THOSE DATES IT'S GENERATED RANDOMLY
        // console.log(self.meals.chain().where(x => true).data()); 
        var meals =  self.meals.chain().where(x => true).data().map((m)=>(
            {
                name:m.name,
                id:m.$loki
            }
        )) ;           
        // console.log(meals);
        return meals;
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
            var plan = self.planned_meals.findOne( { date: { '$eq' : req.params.date_id} } ) ;
            var planned_meal = self.meals.findOne( { "$loki": { '$eq' :plan.id} } ) ;
            if(planned_meal){
                var available_meals = self.meals.chain().data({removeMeta:true});
                var meal_name_option_list = self.renderListTemplate('/public/option_list.html',available_meals.map((m) => ({'data': m.name})));
                var template = self.renderTemplate('/public/planned_meal/edit_planned_meal.html',
                {
                    meal_name:planned_meal.name,
                    meal_date:moment(plan.date).format('dddd, MMMM Do'),
                    meal_name_list: meal_name_option_list,

                });
                template = self.renderTemplate('/public/template.html',{content: template});

                res.send(template); 
            } else {
                console.log('404') ;
                res.send(self.get404()); 
            }
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

            var planned_meal = self.planned_meals.findOne( { date: { '$eq' : req.params.date_id} } ) ;
            var new_meal  = self.meals.findOne( { name: { '$eq' : req.body.mealName} } ) ;
            console.log( planned_meal);
            console.log(new_meal);
            if(new_meal && planned_meal) {
                if(req.body.action == "Update"){
                    console.log('updateing to $loki ', new_meal.$loki);
                    planned_meal.id = new_meal.$loki ;
                    self.planned_meals.update(planned_meal);
    
                } else if (req.body.action == "Delete"){
                    self.planned_meals.remove(planned_meal);
                }
            }

            self.sendSocketNotification('MEAL_PLAN_UPDATED', {});

            res.redirect('/mealplan');
        });

        
        
        ///MAIN - MEALLIST
        self.expressApp.route('/mealplan/meallist')
        .get(function (req, res) {
            var currentMealListItems = self.renderListTemplate('/public/meal/meal_list_item.html', self.getMeals());
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

            //AUTO INCREMENT
            new_meal = {} ;

            new_meal.name = req.body.name ;

            // console.log(new_meal.name);

            //ADD TO DB
            self.meals.insert(new_meal) 
            self.db.save() ;

            

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
        self.expressApp.get('/mealplan/meallist/edit/:id', self.textParser, function (req, res) {
            //GET CREATE MEAL
            //FIND EXISTING MEAL

            // console.log(parseInt(req.params.id));
            
            // console.log(self.meals) ;
            // var existingMeal = self.meals.chain().data({removeMeta:true})[0];

            var existingMeal = self.meals.findOne( { '$loki': { '$eq' : parseInt(req.params.id) } });
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
        self.expressApp.post('/mealplan/meallist/edit/:id',  bodyParser.urlencoded({
            extended: false
        }), function (req, res) {
            //POST EDIT MEAL
            // POST NEW MEAL
        
            // console.log('posting a meal edit') ;
            if (!req.body){
                return res.sendStatus(400)
            } 

            var existingMeal = self.meals.findOne( { "$loki": { '$eq' :parseInt(req.params.id) } }) ;
            // console.log(existingMeal) ;
            if(existingMeal){

                //VALIDATE FORM

                //IF FORM IS VALID
                existingMeal.name = req.body.name
                self.meals.update(existingMeal);

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
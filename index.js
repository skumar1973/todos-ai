
import {db} from './db/index.js';

import {todosTable} from './db/schema.js';

import {ilike, eq} from 'drizzle-orm';

import OpenAI from  'openai';

import readlineSync from 'readline-sync'

const client = new OpenAI()

async function getAllTodos() {
    const todos = await  db.select().from(todosTable);
    return todos;
}

async function createTodo(todo) {
    console.log('createTodo', todo);
    const [result] = await  db.insert(todosTable).values({todos: todo}).returning({id:todosTable.id});
    console.log('result', result);
    return result.id;
}

async function deleteToDoById(id) {
    await  db.delete(todosTable).where(eq(todosTable.id, id));
}

async function searchTodo(search) {
    const todos = await  db.select().from(todosTable).where(ilike(todosTable.todos, `%${search}%`));
    return todos;
}
const tools ={
    getAllTodos: getAllTodos,
    createTodo: createTodo,
    deleteToDoById: deleteToDoById,
    searchTodo:searchTodo
};

const SYSTEM_PROMPT=`
You are an AI to-do list assistant with START, PLAN, ACTION obsevation and output state.
wait for the user prompt and first plan using available tools.
after planning take the action with appropriate tools and wait for the observation based on action.
once you get the observation return the AI respose based on START prompt and obsevation. 
you can manage tasks by adding , viewing, updating and deleting.
you most strictly follow the JSON output format.

ToDo DB schema:
Id: integer and primary key
Todos: string and not null
create_at: date and time
updated_at: date and time

available tools:
 - getAllTodos() : return all todos from database
 - createTodo(todo: string)  : create a new todo in the table and takes a string as a todo.
 - deleteToDoById(id : integer) : delete a todo from the database table and takes a integer id to search and delete it from databse.
 - searchTodo(search : string) : search all todos from the database table and takes a search as a string and return all matching todos query,

example:
START: 
{'type' : 'user', 'user' : 'add a task for grocery shppong'},
{'type' : 'plan', 'user' : 'i will try to get more context on what all item user want to buy for grocery shppong'},
{'type' : 'output', 'output' : 'can you tell me what all item YOU WANT TO buy for grocery shppong'},
{'type' : 'user', 'user' : 'i want to buy milk, kurkure, leys and chocos for grocery shppong'},
{'type' : 'plan', 'user' : 'i will use createTodo tool for  a new task for grocery shppong'},
{'type' : 'action', 'function' : ' createTodo' : 'input' : 'shop milk, kurkure, leys and chocos for grocery shppong'},
{'type' : 'observation', 'observation' : '2'},
{'type' : 'output', 'output' : 'your todos is added successfully'},
`;



const messages = [{ role: 'system', content: SYSTEM_PROMPT}];

while (true) {
    const query = readlineSync.question(">>");
    const userMessage = {
        type: 'user',
        user: query
    };

    messages.push({role: 'user', content : JSON.stringify(userMessage) });
    console.log('loop 1 messages:', messages);

    // auto prompting 
    while (true) {
      
        const chat = await client.chat.completions.create({
            model: 'gpt-4.1',
            messages: messages,
            response_format: {type: 'json_object'},
        });

        console.log('chat: ', chat.choices[0].message.content);

        const result = chat.choices[0].message.content;
        
        messages.push({role:'assistant', content: result});
        
        const action = JSON.parse(result);
        console.log('Bot', action.output);
        if (action.type === 'output') {
            console.log('Bot', action.output);
            break;
        } else if (action.type === 'action') {
            console.log('action.function', action.function);
            const fn = tools[action.function];
            console.log('fn:', fn);
            if (!fn) {
                throw new Error("Invalid tool call");
            }
            
            console.log('action.input:', action.input);

            const observation=await fn(action.input);
            const observationMessage = {
                type : 'observation',
                observation: observation,
            }
            messages.push({role:'developer', content: JSON.stringify(observationMessage)});
        console.log('loop 2 messages:', messages);
        }
    }
}
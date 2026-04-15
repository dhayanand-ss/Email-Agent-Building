I want to build an email reply agent for gmail.

Use gmail API to fetch everything from primary inbox.

The agent should craft the reply using OpenAI or Gemini API.

There should be a supabase database where the knowledge is stored.

Basically we have courses or programs regarding which we will receive emails.

So when the reply is crafted it should refer to the document mentioning the program info.

I need the ability to modify the email drafted by AI before sending (if required).

In the supabase the original email drafted by AI and the one I sent should be stored.

The frontend should be deployed on vercel. If backend functions are needed you can use railway.

You should never send an email automatically.

The user should approve with one button click.

Implement authentication so that only the owner of the email has access.

The login can be via google login

for every email reply, there should be a star rating and textual feedback option that is stored on 

The existing knowledge base in the csv file in the working directory should be converted to a vector database and stored in supabase. You will have to perform RAG to fetch the relevant infor from the vector database

The implementation should happen in phases. So you should plan first, ask my preferences and then execute in phases.


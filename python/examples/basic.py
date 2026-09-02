from greeneek import Greeneek

client = Greeneek()
print(client.meta()["name"])
for event in client.run("Explain Greeneek in one sentence."):
    if event["type"] == "assistant/stream":
        print(event["data"]["delta"], end="")

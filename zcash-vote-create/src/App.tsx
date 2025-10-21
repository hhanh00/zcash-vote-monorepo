import { SubmitHandler, useForm } from "react-hook-form";
import { Channel, invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import Swal from "sweetalert2";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import Joyride from 'react-joyride';
import { Spinner } from "./Spinner";

const NU5 = 1687104;

const electionSchema = z
  .object({
    name: z.string().min(3).max(120),
    start: z.number().int().min(NU5),
    end: z.number().int().min(NU5),
    question: z.string().min(1),
    choices: z.string().min(1),
    signature_required: z.boolean(),
  })
  .refine((d) => d.end >= d.start, {
    message: "End must be higher than Start",
    path: ["end"],
  });

type ElectionData = {
  seed: string;
  election: any;
};

function App() {
  const [progress, setProgress] = useState<number | undefined>();
  const [seed, setSeed] = useState<string>("");
  const [election, setElection] = useState<any>();
  const [showSeed, setShowSeed] = useState(false);
  const [creating, setCreating] = useState(false);

  const form = useForm<z.infer<typeof electionSchema>>({
    resolver: zodResolver(electionSchema),
    defaultValues: {
      name: "",
      start: NU5,
      end: NU5,
      question: "",
      choices: "",
      signature_required: false,
    },
  });

  const { control, handleSubmit } = form;

  const steps = [
    {
      target: ".name",
      content: "This is the name of the election. It should clearly identify it and must be unique.",
    },
    {
      target: ".start",
      content: "The beginning of the coin registration range.\nTo qualify for the election, the elector must have acquired these coins after that height.\nIt must be higher than the NU-5 activation height.",
    },
    {
      target: ".end",
      content: "The end of the coin registration range.\nTo qualify for the election, the elector must have acquired these coins before that height.\nCoins can be moved after that height without affecting the ability to vote.",
    },
    {
      target: ".question",
      content: "The question that electors are polled on.",
    },
    {
      target: ".choices",
      content: "The possible answers. Only one answer per vote. But multiple votes can be cast as long as the elector has enough funds.",
    },
    {
      target: ".signature",
      content: "Check if this election should require the electors to include a signature (proving ownership).\nIf unchecked, electors only need the viewing key.",
    },
  ];

  const onSubmit: SubmitHandler<z.infer<typeof electionSchema>> = (data) => {
    (async () => {
      const channel = new Channel<number>();
      channel.onmessage = (p) => {
        setProgress(p);
      };

      try {
        setCreating(true);
        const election: string = await invoke("create_election", {
          election: data,
          channel: channel,
        });
        const electionData: ElectionData = JSON.parse(election);
        const seed = electionData.seed;
        setSeed(seed);
        setElection(electionData.election);
        setShowSeed(true);
      } catch (e: any) {
        await Swal.fire({
          icon: "error",
          title: e,
        });
      }
      finally {
        setCreating(false);
      }
    })();
  };

  const saveElectionFile = () => {
    (async () => {
      setShowSeed(false);
      const id = await invoke('get_election_id', { election: election });
      const path = await save({
        defaultPath: `${id}.json`,
        title: "Save Election File",
        filters: [
          {
            name: "Election",
            extensions: ["json"],
          },
        ],
      });
      await invoke("save_election", { path: path, election: election });
    })();
  };

  return (
    <main className="w-screen flex justify-center items-center">
      {creating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Spinner />
        </div>
      )}

      <Joyride steps={steps} continuous={true} showSkipButton={true} />
      <Card className="w-md p-2">
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
            <h2 className="text-xl py-3 font-extrabold">Create an Election/Vote</h2>
            <FormField
              control={control}
              name="name"
              render={({ field }) => (
                <FormItem className="name">
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="start"
              render={({ field }) => (
                <FormItem className="start">
                  <FormLabel>Registration Start</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(v) =>
                        v && field.onChange(v.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Coins must be *younger* than that height to qualify
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="end"
              render={({ field }) => (
                <FormItem className="end">
                  <FormLabel>Registration End</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(v) =>
                        v && field.onChange(v.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Coins must be *older* than that height to qualify
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="question"
              render={({ field }) => (
                <FormItem className="question">
                  <FormLabel>Ballot Question</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="choices"
              render={({ field }) => (
                <FormItem className="choices">
                  <FormLabel>Ballot Choices</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={10} />
                  </FormControl>
                  <FormDescription>Use one line per choice</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="signature_required"
              render={({ field }) => (
                <FormItem className="signature">
                  <div className="flex items-center justify-between">
                    <FormLabel>Signature Required</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                  <FormDescription>
                    If checked, voters must have the secret key
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button className="my-4" onClick={() => {}} type="submit">
              Create Election File
            </Button>
            {progress && <Progress value={progress} />}
          </form>
        </Form>
      </Card>
      <Dialog open={showSeed}>
        <DialogContent>
          <Card className="p-2">
            <CardTitle>Election Seed</CardTitle>
            <CardContent>
              <h3 className="mb-5 text-md font-normal text-red-500 dark:text-gray-400 py-2">
                You MUST save these 24 words in the correct order and spelling.
                It is impossible to decode the votes without them.
              </h3>
              <h4 className="text-lg mb-4 border border-red-400 p-1">{seed}</h4>
              <div className="flex justify-center gap-4">
                <Button onClick={saveElectionFile}>
                  OK, I have saved them
                </Button>
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default App;

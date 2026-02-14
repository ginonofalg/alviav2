import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Loader2 } from "lucide-react";
import type { Persona } from "@shared/schema";

const personaFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional().nullable(),
  ageRange: z.string().max(50).optional().nullable(),
  gender: z.string().max(50).optional().nullable(),
  occupation: z.string().max(100).optional().nullable(),
  location: z.string().max(100).optional().nullable(),
  attitude: z.enum(["cooperative", "reluctant", "neutral", "evasive", "enthusiastic"]),
  verbosity: z.enum(["low", "medium", "high"]),
  domainKnowledge: z.enum(["none", "basic", "intermediate", "expert"]),
  communicationStyle: z.string().max(200).optional().nullable(),
  backgroundStory: z.string().max(1000).optional().nullable(),
});

type PersonaFormValues = z.infer<typeof personaFormSchema>;

interface PersonaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: PersonaFormValues & { traits: string[]; topicsToAvoid: string[]; biases: string[] }) => void;
  persona?: Persona | null;
  isPending?: boolean;
}

function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [inputValue, setInputValue] = useState("");

  const addTag = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
      setInputValue("");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          data-testid={`input-tag-${placeholder.toLowerCase().replace(/\s+/g, "-")}`}
        />
        <Button type="button" variant="outline" size="icon" onClick={addTag} data-testid="button-add-tag">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1">
              {v}
              <button type="button" onClick={() => onChange(values.filter((t) => t !== v))} className="ml-1">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function PersonaFormDialog({ open, onOpenChange, onSubmit, persona, isPending }: PersonaFormDialogProps) {
  const [traits, setTraits] = useState<string[]>(persona?.traits || []);
  const [topicsToAvoid, setTopicsToAvoid] = useState<string[]>(persona?.topicsToAvoid || []);
  const [biases, setBiases] = useState<string[]>(persona?.biases || []);

  const form = useForm<PersonaFormValues>({
    resolver: zodResolver(personaFormSchema),
    defaultValues: {
      name: persona?.name || "",
      description: persona?.description || "",
      ageRange: persona?.ageRange || "",
      gender: persona?.gender || "",
      occupation: persona?.occupation || "",
      location: persona?.location || "",
      attitude: persona?.attitude || "cooperative",
      verbosity: persona?.verbosity || "medium",
      domainKnowledge: persona?.domainKnowledge || "basic",
      communicationStyle: persona?.communicationStyle || "",
      backgroundStory: persona?.backgroundStory || "",
    },
  });

  useEffect(() => {
    if (persona) {
      form.reset({
        name: persona.name,
        description: persona.description || "",
        ageRange: persona.ageRange || "",
        gender: persona.gender || "",
        occupation: persona.occupation || "",
        location: persona.location || "",
        attitude: persona.attitude as any,
        verbosity: persona.verbosity as any,
        domainKnowledge: persona.domainKnowledge as any,
        communicationStyle: persona.communicationStyle || "",
        backgroundStory: persona.backgroundStory || "",
      });
      setTraits(persona.traits || []);
      setTopicsToAvoid(persona.topicsToAvoid || []);
      setBiases(persona.biases || []);
    } else {
      form.reset({
        name: "", description: "", ageRange: "", gender: "", occupation: "",
        location: "", attitude: "cooperative", verbosity: "medium",
        domainKnowledge: "basic", communicationStyle: "", backgroundStory: "",
      });
      setTraits([]);
      setTopicsToAvoid([]);
      setBiases([]);
    }
  }, [persona, open]);

  const handleSubmit = (values: PersonaFormValues) => {
    onSubmit({ ...values, traits, topicsToAvoid, biases });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{persona ? "Edit Persona" : "Create Persona"}</DialogTitle>
          <DialogDescription>
            {persona ? "Update the persona's demographics and behavioral traits." : "Define a simulated respondent with specific demographics and behavioral traits."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Sarah, Tech Enthusiast" data-testid="input-persona-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="ageRange" render={({ field }) => (
                <FormItem>
                  <FormLabel>Age Range</FormLabel>
                  <FormControl><Input {...field} value={field.value || ""} placeholder="e.g. 25-34" data-testid="input-persona-age" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <FormControl><Input {...field} value={field.value || ""} placeholder="e.g. Female" data-testid="input-persona-gender" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="occupation" render={({ field }) => (
                <FormItem>
                  <FormLabel>Occupation</FormLabel>
                  <FormControl><Input {...field} value={field.value || ""} placeholder="e.g. Software Engineer" data-testid="input-persona-occupation" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl><Input {...field} value={field.value || ""} placeholder="e.g. London, UK" data-testid="input-persona-location" /></FormControl>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea {...field} value={field.value || ""} placeholder="Brief description of this persona" className="resize-none" data-testid="input-persona-description" /></FormControl>
              </FormItem>
            )} />

            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="attitude" render={({ field }) => (
                <FormItem>
                  <FormLabel>Attitude</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger data-testid="select-persona-attitude"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="cooperative">Cooperative</SelectItem>
                      <SelectItem value="reluctant">Reluctant</SelectItem>
                      <SelectItem value="neutral">Neutral</SelectItem>
                      <SelectItem value="evasive">Evasive</SelectItem>
                      <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="verbosity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Verbosity</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger data-testid="select-persona-verbosity"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="domainKnowledge" render={({ field }) => (
                <FormItem>
                  <FormLabel>Domain Knowledge</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger data-testid="select-persona-domain"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="expert">Expert</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="communicationStyle" render={({ field }) => (
              <FormItem>
                <FormLabel>Communication Style</FormLabel>
                <FormControl><Input {...field} value={field.value || ""} placeholder="e.g. Formal, uses technical jargon" data-testid="input-persona-comm-style" /></FormControl>
              </FormItem>
            )} />

            <div className="space-y-2">
              <FormLabel>Personality Traits</FormLabel>
              <TagInput values={traits} onChange={setTraits} placeholder="Add a trait" />
            </div>

            <FormField control={form.control} name="backgroundStory" render={({ field }) => (
              <FormItem>
                <FormLabel>Background Story</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value || ""} placeholder="Optional background context for more realistic responses" className="resize-none" rows={3} data-testid="input-persona-background" />
                </FormControl>
              </FormItem>
            )} />

            <div className="space-y-2">
              <FormLabel>Topics to Avoid</FormLabel>
              <TagInput values={topicsToAvoid} onChange={setTopicsToAvoid} placeholder="Add a topic" />
            </div>

            <div className="space-y-2">
              <FormLabel>Biases / Preferences</FormLabel>
              <TagInput values={biases} onChange={setBiases} placeholder="Add a bias" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-persona">
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {persona ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

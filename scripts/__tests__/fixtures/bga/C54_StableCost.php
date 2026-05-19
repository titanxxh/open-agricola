<?php
namespace AGR\Cards;
class C54_StableCost extends Card
{
  public function __construct()
  {
    $this->name = clienttranslate('Stable Cost');
    $this->deck = 'C';
    $this->number = 54;
    $this->cost = [ STABLE => '1',];
  }
}
